//This module is responsible for :
// a) Producing and maintaining proxy Browser windows owned by another runtime.
// b) Keeping window group state cross runtimes

import { BrowserWindow as BrowserWindowElectron } from 'electron';
import { OpenFinWindow, Identity, BrowserWindow, ChildFrameInfo, PreloadScriptState } from '../shapes';
import { default as connectionManager, PeerRuntime } from './connection_manager';
import * as coreState from './core_state';
import { _Window } from 'hadouken-js-adapter/out/types/src/api/window/window';
import { EventEmitter } from 'events';
import { writeToLog } from './log';

class MyEmitter extends EventEmitter {}

const externalWindowsProxyList = new Map<string, RuntimeProxyWindow>();

//TODO: better name.
export const eventsPipe = new MyEmitter();

export interface RuntimeProxyWindow {
    hostRuntime: PeerRuntime;
    window: OpenFinWindow;
    wrappedWindow: _Window;
    isRegistered: boolean;
}

export interface RemoteWindowInformation {
    proxyWindow: RuntimeProxyWindow;
    existingWindowGroup: Array<RuntimeProxyWindow>;
}

//TODO: should return bool as well if this needs registration
export async function getRuntimeProxyWindow(identity: Identity): Promise<RuntimeProxyWindow> {
    const { uuid, name } = identity;
    const windowKey = `${uuid}${name}`;
    const existingProxyWindow = externalWindowsProxyList.get(windowKey);

    if (existingProxyWindow) {
        return existingProxyWindow;
    } else {
        const { runtime: hostRuntime} = await connectionManager.resolveIdentity(identity);
        const wrappedWindow = hostRuntime.fin.Window.wrapSync(identity);
        const nativeId = await wrappedWindow.getNativeId();
        const proxyWindowOptions = {
            hwnd: '' + nativeId,
            uuid,
            name,
            url: ''
        };
        const browserwindow: any = new BrowserWindowElectron(proxyWindowOptions);

        browserwindow._options = proxyWindowOptions;
        const window: OpenFinWindow = {
            _options : proxyWindowOptions,
            _window : <BrowserWindow>browserwindow,
            app_uuid: wrappedWindow.identity.uuid,
            browserWindow: <BrowserWindow>browserwindow,
            children: new Array<OpenFinWindow>(),
            frames: new Map<string, ChildFrameInfo>(),
            forceClose: false,
            groupUuid: '',
            hideReason: '',
            id: 0,
            name,
            preloadScripts: new Array<PreloadScriptState>(),
            uuid,
            mainFrameRoutingId: 0,
            isProxy: true
        };

        const runtimeProxyWindow = {
            window,
            hostRuntime,
            wrappedWindow,
            isRegistered: false
        };
        externalWindowsProxyList.set(windowKey, runtimeProxyWindow);
        return runtimeProxyWindow;
    }
}
export async function getWindowGroupProxyWindows(runtimeProxyWindow: RuntimeProxyWindow) {
    const { identity } = runtimeProxyWindow.wrappedWindow;
    const winGroup = await runtimeProxyWindow.wrappedWindow.getGroup();
    const existingWindowGroup: Array<RuntimeProxyWindow> = [];

    await Promise.all(winGroup.map(async (w) => {
        //check if we are dealing with a local window.
        if (coreState.getWindowByUuidName(w.identity.uuid, w.identity.name)) {
            return;
        }
        //confirm we do not return the same runtimeProxyWindow.
        if (w.identity.uuid !== identity.uuid || w.identity.name !== identity.name) {
            const pWin = await getRuntimeProxyWindow(w.identity);
            existingWindowGroup.push(pWin);
        }
    }));

    return existingWindowGroup;
}

export async function registerRemoteProxyWindow(sourceIdentity: Identity, win: RuntimeProxyWindow) {
    //TODO: this might need to be optional or in a seperate function. not all events will require a merge.
    const source = win.hostRuntime.fin.Window.wrapSync(sourceIdentity);
    await win.wrappedWindow.mergeGroups(source);

    await win.wrappedWindow.on('group-changed', (evt) => {
        writeToLog('info', 'Group changed event');
        writeToLog('info', evt);

        //We only care for leave now so we look for target.
        if (win.window.uuid === evt.targetWindowAppUuid && win.window.name === evt.targetWindowName) {
            //we will construct a state object here but now let's focus on leave group:
            if (evt.reason === 'leave') {
                const leaveGroupState = {
                    action: 'remove',
                    identity: {
                        uuid: evt.targetWindowAppUuid,
                        name: evt.targetWindowName
                    },
                    window: win.window
                };
                eventsPipe.emit('process-change', leaveGroupState);
            }
            if (evt.reason === 'join') {
                //TODO: handle the case where the window has joined another group (check the memberOf and source/target groups properties)
                const joinGroupState = {
                    action: 'add',
                    identity: {
                        uuid: evt.sourceWindowAppUuid,
                        name: evt.sourceWindowName
                    },
                    window: win.window
                };
                eventsPipe.emit('process-change', joinGroupState);
            }
        }
    });
    await win.hostRuntime.fin.once('disconnected', () => {
        //raise some normalized events, also re-write to allow cleanup.
        //do more stuff.
    });
}

export async function unregisterRemoteProxyWindow(identity: Identity) {
    const runtimeProxyWindow = await getRuntimeProxyWindow(identity);
    runtimeProxyWindow.wrappedWindow.removeAllListeners();
}

//Leave from a single group
// {
//     "topic": "window",
//     "type": "group-changed",
//     "uuid": "OpenfinPOC2",
//     "name": "OpenfinPOC2",
//     "reason": "leave",
//     "sourceGroup": [
//         {
//             "appUuid": "OpenfinPOC",
//             "windowName": "OpenfinPOC"
//         }],
//     "sourceWindowAppUuid": "OpenfinPOC2",
//     "sourceWindowName": "OpenfinPOC2",
//     "targetGroup": [],
//     "targetWindowAppUuid": "OpenfinPOC2",
//     "targetWindowName": "OpenfinPOC2",
//     "memberOf": "nothing"
// }
