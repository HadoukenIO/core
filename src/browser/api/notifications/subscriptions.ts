/*
Copyright 2018 OpenFin Inc.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
import * as Rx from 'rx';
import * as seqs from './observable_sequences';
import NoteAction from './note_action';
import {
    AvailableRect, NotificationMessage, Identity,
    IdtoNameMap, NoteNameToParent, NameToNoteId,
    PendingNote
} from './shapes';

// required tor the ts compiler, theses should be made imports eventually
declare var require: any;
declare var Buffer: any;

const {System} = require('../system');
const {Window} = require('../window');
const {Application} = require('../application');
const {sendToIdentity} = require('../../api_protocol/api_handlers/api_protocol_base');
import ofEvents from '../../of_events';
const {writeToLog} = require('../../log');
const _ = require('underscore');
import route from '../../../common/route';


const NOTE_APP_UUID = 'service:notifications';
const MAX_NOTES = 5;
const positionWindows = _.debounce(positionWindowsImmediate, 300, false);

// <= 5.0 used notification ids, 6.0 uses the names, this provides the
// mapping between the two ex. {uuid :{noteId: name}}
const idToNameMap: IdtoNameMap = {};
const noteNameToParent: NoteNameToParent = {};
const nameToNoteId: NameToNoteId = {};
const pendingExternalNoteRequests: Array<() => void> = [];
const qCounterTarget = {
    name: '',
    uuid: ''
};
const NOTE_WIDTH = 300;
const NOTE_PAD_RIGHT = 10;
const NOTE_WIDTH_AND_PAD = NOTE_WIDTH + NOTE_PAD_RIGHT;
const POSITION_ANIMATION_DURATION = 400;
const NOTE_HEIGHT = 90;
const NOTE_TOP_MARGIN = 70;

let askedFor = 0;
let created = 0;
let pendindNotes: Array<PendingNote> = [];
const potentialQCounterTargets: Array<Identity> = [];
const notesToBeCreated: Array<string> = [];
let proxyAppInitialized = false;
let proxyAppReady = false;

ofEvents.once('notification-service-ready', () => {
    try {
        pendingExternalNoteRequests.forEach(noteFn => noteFn());
        proxyAppReady = true;
    } catch (e) {
        writeToLog('info', e);
    }
});

ofEvents.on(route.window('closed', '*'), (e: any) => {

    // because we are in the browser, this just ensures that any sync events
    // that happen on the back end of a closed event have time to complete
    // before we go through and alter the state of the notification stack
    setTimeout(() => {

        cleanPendingNotes();

        try {
            const {uuid, name} = e.data[0];

            if (Window.isNotification(name)) {
                seqs.removes.onNext({uuid, name});
            }
        } catch (e) {
            writeToLog('info', e);
        }
    }, 10);

});

/*
Because we dont have a reload event, just be sure to clear out any
notes from a window that just loaded. the shape of the load/* event
is the following:
{
    'channel': 'application',
    'topic': 'window-end-load',
    'source': 'app1',
    'data': [
        {
            'name': 'app1',
            'uuid': 'app1',
        },
    ],
}
*/
ofEvents.on(route.application('window-end-load', '*'), (e: any) => {

    try {
        const { uuid, name} = e.data[0];

        const notesToClose = getCurrNotes().filter((note: Identity) => {
            let parentWasRefreshed = false;

            Object.keys(noteNameToParent).forEach((nameKey: string) => {
                const {name: nameFromHash} = noteNameToParent[nameKey];

                if (nameFromHash === name) {
                    parentWasRefreshed = true;
                }

            });

            return parentWasRefreshed;
        });

        notesToClose.forEach((id: Identity) => {
            Window.close(id);
        });

        cleanPendingNotes({ uuid, name });

        if (qCounterTarget.uuid === uuid &&
            qCounterTarget.name === name) {
            try {
                Window.close({
                    uuid,
                    name: Window.QUEUE_COUNTER_NAME
                });
            } catch (e) {
                writeToLog('info', e);
            }
        }

    } catch (e) {
        writeToLog('info', e);
    }
});

seqs.requestNoteClose
    .subscribe((req: NotificationMessage) => {
        try {
            const noteIsOpen = windowIsValid(req.id);

            if (noteIsOpen) {
                const ns = getCurrNotes();
                const mousePos = System.getMousePosition();
                const monitorInfo = getPrimaryMonitorAvailableRect();
                const mouseOver = mouseisOverNotes(mousePos, monitorInfo, ns.length);

                if (!mouseOver || req.data.force) {
                    closeNotification(req);

                } else {
                    scheduleNoteClose(req, 1000);
                }
            } else {
                removePendingNote(req.id);
            }
        } catch (e) {
            writeToLog('info', e);
        }
    });

seqs.position
    .subscribe(liveNotes => {
        positionWindows(liveNotes);
    });

seqs.noteStack
    .subscribe(liveNotes => {
        seqs.position.onNext(liveNotes);
    });

seqs.isAnimating
    .subscribe((animationPayload: Object) => {
        const payload = <NotificationMessage> {
            action: NoteAction.animating,
            data: animationPayload,
            id: {}
        };

        ofEvents.emit(route('notifications', 'listener/'), payload); // legacy trailing slash; do not remove!
    });

seqs.removes.subscribe((removedOpts: Object) => {
    cleanPendingNotes ();

    try {

        if (shouldCreatePendingNote()) {
            createPendingNote();
        }

        assignAndUpdateQCounter();
    } catch (e) {
        writeToLog('info', e);
    }
});

function noteStackCount() {
    let pendingNotYetCounted = 0;
    const numNotes = System.getAllWindows()
        .reduce((prev: any, currApp: any) => {
            const {childWindows} = currApp;
            const childNoteWindows = childWindows.filter((win: any) => {
                    const {name} = win;

                    // This guards against the case where the window shows up in the
                    // core state as a child but the created_notes message has not
                    // arrived yet
                    if (notesToBeCreated.indexOf(name) !== -1) {
                        --pendingNotYetCounted;
                    }

                    return Window.isNotification(name);
                });

            return prev.concat(childNoteWindows);
        }, []).length;
    const nsCount = numNotes + (askedFor - created) + pendingNotYetCounted;

    return Math.max(nsCount, 0);
}

function getCurrNotes (): Array<Identity> {
    return System.getAllWindows()
        .reduce((prev: any, currApp: any) => {
            const {childWindows} = currApp;
            const childrenAsIdentities = childWindowsAsIdentities(childWindows, currApp.uuid);
            return prev.concat(childrenAsIdentities);
        }, []);
}

function childWindowsAsIdentities(childWindows: Array<any>, appUuid: string): Array<Identity> {
    return childWindows
        .filter((win: any) => Window.isNotification(win.name))
        .map((win: any) => {

            return {
                name: win.name,
                uuid: appUuid
            };
        });
}

function inPotentialQCounterTargets (id: Identity): boolean {
    const {uuid, name} = id;
    let found = false;
    const len = potentialQCounterTargets.length;

    for (let i = 0; i < len; i++) {
        const target = potentialQCounterTargets[i];
        const nameMatch = target.name === name;
        const uuidMatch = target.uuid === uuid;
        const match = nameMatch && uuidMatch;

        if (match) {
            found = true;
            break;
        }
    }

    return found;
}

function qCounterTargetIsValid(): boolean {
    const {uuid, name} = qCounterTarget;

    return uuid && name && windowIsValid(qCounterTarget);
}

// TODO the creates has a shape data->options, make interface
function requestNoteCreation (noteData: any, parent: any) {
    const {options: {uuid, name}} = noteData;
    const noteStackLen = noteStackCount();

    if (noteStackLen >= MAX_NOTES) {
        pendindNotes.push({noteData, parent});

    } else {
        const {ack} = noteData;

        ++askedFor;
        notesToBeCreated.push(name);
        invokeCreateAck(ack);
    }

    updateQcounterCount(parent);
}

function updateQcounterCount(identity: Identity): void {
    const {name, uuid} = identity;

    if (!inPotentialQCounterTargets(identity)) {
        potentialQCounterTargets.push(identity);
    }

    if (!qCounterTargetIsValid()) {
        qCounterTarget.uuid = uuid;
        qCounterTarget.name = name;
    }

    assignAndUpdateQCounter();
}

function assignQCounterToWindow() {
    const  numTargets = potentialQCounterTargets.length;
    for (let i = 0; i < numTargets; i++) {
        const id = potentialQCounterTargets[i];

        if (windowIsValid(id)) {
            qCounterTarget.uuid = id.uuid;
            qCounterTarget.name = id.name;

            break;
        }
    }
}

function assignAndUpdateQCounter() {
    let payload: any;
    let sendString: any;

    if (!qCounterTargetIsValid()) {
        assignQCounterToWindow();
    }

    payload = createQCounterNumPendingMessage();
    sendString = noteTopicStr(qCounterTarget.uuid, qCounterTarget.name, false);

    ofEvents.emit(sendString, payload);
}

function createQCounterNumPendingMessage() {
    return {
        action: NoteAction.qQueryUpdate,
        data: {
            numPending: pendindNotes.length
        },
        id: {}
    };
}

function positionWindowsImmediate(liveNotes: Object[]) {
    const {bottom} = getPrimaryMonitorAvailableRect();
    const defaultTop = bottom - 100;
    let numNotes: any;
    let animationFunction: any;

    updateAnimationState(true);
    liveNotes = liveNotes.filter(opts => {
        return windowIsValid(opts);
    });
    numNotes = liveNotes.length;
    animationFunction = genAnimationFunction(defaultTop, numNotes);
    liveNotes.forEach(animationFunction);
}

function genAnimationFunction(defaultTop: number, numNotes: number): (noteWin: any, idx: number) => void {
    return (noteWin: any, idx: number) => {
        const {name, uuid} = noteWin;
        const identity: Identity = {name, uuid};
        const opacity = isNaN(noteWin.opacity) ? 1 : noteWin.opacity;
        const animationTransitions = {
            opacity: {
                duration: 1000,
                opacity
            },
            position: {
                duration: POSITION_ANIMATION_DURATION,
                top: (defaultTop - (numNotes - idx) * NOTE_HEIGHT) + NOTE_TOP_MARGIN
            }
        };
        const animationCallback = () => {

            // release on the last one
            if (idx === numNotes - 1) {
                updateAnimationState(false);
            }
        };
        const animationOptions = {};

        Window.animate(identity, animationTransitions, animationOptions, animationCallback);
    };
}

function mouseisOverNotes(mousePos: any, monitorInfo: any, noteStackLength: number) {

    return mousePos.left > monitorInfo.right - 310 &&
        monitorInfo.bottom - mousePos.top < noteStackLength * 110;
}

function genBaseAnimateOpts () {
    return <any> {
        opacity: {
            duration: 300,
            opacity: 0
        },
        position: {
            duration: 300
        }
    };
}

function createNoteProxyApp () {
    Application.create({
        autoShow: false,
        name: NOTE_APP_UUID,
        nonPersistent: true,
        url: 'about:blank',
        uuid: NOTE_APP_UUID
    });

    Application.run({
        name: NOTE_APP_UUID,
        uuid: NOTE_APP_UUID
    });

    proxyAppInitialized = true;
}

function emitCreateMsg(msg: NotificationMessage, proxyUuid: string) {
    const {data} = msg;

    data.uuid = NOTE_APP_UUID;
    data.name = NOTE_APP_UUID;
    data.uuidOfProxiedApp = proxyUuid;

    msg.action = NoteAction.proxied_create_call;
    ofEvents.emit(noteTopicStr(NOTE_APP_UUID, NOTE_APP_UUID, true), msg);
}

function createNoteViaProxy(msg: NotificationMessage): void {
    const {id: {uuid}} = msg;

    if (!proxyAppInitialized) {
        createNoteProxyApp();
    }

    if (!proxyAppReady) {
        pendingExternalNoteRequests.push(emitCreateMsg.bind(null, msg, uuid));
    } else {
        emitCreateMsg(msg, uuid);
    }
}

function handleNoteCreate(msg: NotificationMessage): void {
    const {data, id: {uuid, name}} = msg;
    let isOwnedByProxy = false;
    let parent: any;

    const { options: {
        notificationId, uuidOfProxiedApp, name: noteName}
    }: { options: { notificationId: number, uuidOfProxiedApp: string, name: string } } = data;

    if (notificationId !== undefined && uuidOfProxiedApp !== undefined) {
        isOwnedByProxy = true;

        if (!idToNameMap[uuidOfProxiedApp]) {
            idToNameMap[uuidOfProxiedApp] = {};
        }

        idToNameMap[uuidOfProxiedApp][notificationId] = noteName;
        nameToNoteId[noteName] = notificationId;
        parent = {isOwnedByProxy, name: uuidOfProxiedApp, uuid: uuidOfProxiedApp};

    } else {
        parent = {uuid, name, isOwnedByProxy};
    }

    noteNameToParent[noteName] = parent;

    requestNoteCreation(data, parent);
}

function handleNoteCreated(msg: NotificationMessage): void {
    const { data: { options }} = msg;
    const { uuid, name } = options;
    const identity = { uuid, name };

    ++created;

    const idx = notesToBeCreated.indexOf(options.name);

    if (idx !== -1) {
        notesToBeCreated.splice(idx, 1);
    }
    seqs.createdNotes.onNext({ identity, options });
}

function routeRequest(id: any, msg: NotificationMessage, ack: any) {
    const {action, data} = msg;

    data.ack = ack;

    switch (action) {
        case NoteAction.create_external:
            createNoteViaProxy(msg);
            break;

        case NoteAction.create:
            handleNoteCreate(msg);
            break;

        case NoteAction.created_notes:
            handleNoteCreated(msg);
            break;

        case NoteAction.close:
            requestNoteClose(msg);
            break;

        case NoteAction.click:
            dispatchEvent('click', msg);
            break;

        case NoteAction.dismiss:
            dispatchEvent('dismiss', msg);
            break;

        case NoteAction.show:
            dispatchEvent('show', msg);
            break;

        case NoteAction.error:
            dispatchEvent('error', msg);
            break;

        // this is heading TO the notification
        case NoteAction.message:
            dispatchMessageToNote(msg);
            break;

        case NoteAction.message_from_note:
            dispatchEvent('message', msg);
            break;

        case NoteAction.animating:
            seqs.isAnimating.onNext(data);
            break;

        case NoteAction.qQuery:
            ack({
                success: true,
                data: pendindNotes.length
            });
            break;

        default:
            break;
    }
}

function requestNoteClose(msg: NotificationMessage): void {
    const {data, id: {uuid}} = msg;

    if (data.notificationId !== undefined) {
        const destName = idToNameMap[uuid][data.notificationId];
        msg.id.name = destName;
        msg.id.uuid = NOTE_APP_UUID;
    }

    seqs.requestNoteClose.onNext(msg);
}

function dispatchMessageToNote (msg: NotificationMessage): void {
    const {data, id: {uuid, name}} = msg;

    try {
        if (data.notificationId !== undefined) {
            const destName = idToNameMap[uuid][data.notificationId];
            ofEvents.emit(noteTopicStr(NOTE_APP_UUID, destName), msg);
        } else {
            ofEvents.emit(noteTopicStr(uuid, name), msg);
        }
    } catch (e) {
        writeToLog('info', e);
    }
}

function dispatchEvent(event: string, msg: NotificationMessage): void {
    const {id: {uuid, name}} = msg;
    const {isOwnedByProxy} = noteNameToParent[name];

    if (isOwnedByProxy) {
        sendEventToExternal(name, event);
    } else {
        ofEvents.emit(noteTopicStr(uuid, noteNameToParent[name].name), msg);
    }
}

function sendEventToExternal(name: string, eventType: string): void {
    const {uuid: proxiedAppUuid} = noteNameToParent[name];
    //TODO: api_base should not be used outside of api_protocol, need to refacor this
    sendToIdentity({
        name: proxiedAppUuid,
        uuid: proxiedAppUuid
    }, {
        action: 'process-notification-event',
        payload: {
            payload: {
                notificationId: nameToNoteId[name]
            },
            type: eventType
        }
    });
}

function windowIsValid(identity: any): boolean {
    let isValid: boolean;

    try {
        const openfinWindow = Window.wrap(identity.uuid, identity.name);
        const browserWindow = openfinWindow && openfinWindow.browserWindow;

        if (!browserWindow) {
            isValid = false;
        } else if (browserWindow.isDestroyed()) {
            isValid = false;
        } else {
            isValid = true;
        }
    } catch (e) {
        isValid = false;
    }

    return isValid;
}

function cleanPendingNotes(winToExclude: any = false) {
    const notesWithValidParents: Array<PendingNote> = [];

    pendindNotes.forEach((note: any) => {
        const {parent: {uuid, name}} = note.noteData.options;
        const parentExist = windowIsValid({ uuid, name });
        const excludeUuid = winToExclude && winToExclude.uuid === note.parent.uuid;
        const excludeName = winToExclude && winToExclude.name === note.parent.name;
        const excludeNote = excludeUuid && excludeName;

        if (parentExist && !excludeNote) {
            notesWithValidParents.push(note);
        }
    });

    pendindNotes = notesWithValidParents;
}

function noteTopicStr(uuid: string, name: string, isGeneral?: boolean): string {
    return isGeneral
        ? route('notifications', 'listener/') // legacy trailing slash; do not remove!
        : route('notifications', 'listener', uuid, name, true);
}

function closeNotification(req: NotificationMessage): void {
    const animateOpts = genBaseAnimateOpts();
    const {id} = req;

    if (req.data.swipe) {
        animateOpts.position.relative = true;
        animateOpts.position.left = 300;
    }

    updateAnimationState(true);

    Window.animate(id, animateOpts, {}, () => {
        Window.close(id);
        dispatchEvent('close', req);
        // TODO removeFromExternalMaps(id);
    }, (e: any) => { writeToLog('info', e); });
}

function updateAnimationState(animationState: boolean): void {
    seqs.isAnimating.onNext(<any> {
        animating: animationState,
        from: {}
    });
}

function getPrimaryMonitorAvailableRect(): AvailableRect {
    const {primaryMonitor: {availableRect}} = System.getMonitorInfo();

    return availableRect;
}

function getPrimaryMonitorRect(): AvailableRect {
    const {primaryMonitor: {monitorRect}} = System.getMonitorInfo();

    return monitorRect;
}

function scheduleNoteClose(req: NotificationMessage, timeout: number): void {
    Rx.Scheduler.default.scheduleFuture(req,
        timeout,
        (scheduler: any, request: any) => {
            seqs.requestNoteClose.onNext(request);

            return scheduler;
        });
}

function shouldCreatePendingNote(): boolean {
    const lessThanMax = noteStackCount() <= MAX_NOTES;
    const pendingNotesExist = pendindNotes.length > 0;

    return lessThanMax && pendingNotesExist;
}

function createPendingNote(): void {
    const nextNote: any = pendindNotes[0].noteData;
    const noteHasValidParent = windowIsValid({
        name: nextNote.options.uuid,
        uuid: nextNote.options.uuid
    });

    if (noteHasValidParent) {
        const {ack} = nextNote;

        ++askedFor;
        invokeCreateAck(ack);
        pendindNotes.shift();
    }
}

function removePendingNote(identity: Identity): void {
    pendindNotes = pendindNotes.filter(pendingNote => {
        return pendingNote.noteData.options.name !== identity.name;
    });
    assignAndUpdateQCounter();
}

function invokeCreateAck(ack: any): void {
    const {bottom, right} = getPrimaryMonitorRect();

    ack({
        data: {
            left: right - NOTE_WIDTH_AND_PAD,
            top: bottom
        },
        success: true
    });
}

// TODO doc this, general ...
function addEventListener (identity: Identity, type: string, payload: any, cb: any) {
    const {uuid, name} = identity;
    const isGeneral = type === 'general';
    const sub = noteTopicStr(uuid, name, isGeneral);
    return ofEvents.on(sub, cb);
}

export {addEventListener};
export {routeRequest};
