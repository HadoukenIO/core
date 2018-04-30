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
import { default as RequestHandler } from '../transport_strategy/base_handler';
import { MessagePackage } from '../transport_strategy/api_transport_base';
import * as log from '../../log';
import { default as connectionManager } from '../../connection_manager';
import ofEvents from '../../of_events';
import { Identity, OpenFinWindow, APIPayloadAck, EventPayload } from '../../../shapes';
import { BrowserWindow } from 'electron';
import route from '../../../common/route';
import { addRemoteSubscription, RemoteSubscriptionProps } from '../../remote_subscriptions';

const { Window } = require('../../api/window');
const coreState = require('../../core_state');
const WindowGroup = require('../../window_groups.js');


const isLocalUuid = (uuid: string): Boolean => {
    const externalConn = coreState.getExternalAppObjByUuid(uuid);
    const app = coreState.getAppObjByUuid(uuid);

    return externalConn || app ? true : false;
};

const handleExternallyGroupedLocalWindow = async (ofWindow: OpenFinWindow, msg: MessagePackage) => {
    const externalParentUuid = ofWindow && ofWindow.meshGroupUuid;
    const { data, ack, nack } = msg;
    const action = data && data.action;

    const id = await connectionManager.resolveIdentity({uuid: externalParentUuid});
    const message = {...data };
    if (action !== 'leave-window-group') {
        message.payload = {...message.payload, groupingUuid: externalParentUuid, groupingWindowName: externalParentUuid };
    }
    id.runtime.fin.System.executeOnRemote({ uuid: externalParentUuid, name: externalParentUuid }, message)
    .then(ack)
    .catch(nack);
    return;
};

const meshJoinGroupEvents = (identity: Identity, grouping: Identity): void => {
    const unsubscriptions: (Promise<() => void>)[] = [];
    const localUnsubscriptions: (() => void)[] = [];
    const eventMap: any = {
        'begin-user-bounds-changed': 'begin-user-bounds-change',
        'end-user-bounds-changed': 'end-user-bounds-change',
        'bounds-changing': 'moving',
        'bounds-changed': 'bounds-changed',
        'focused': 'focus',
        'minimized': 'state-change',
        'maximized': 'state-change',
        'restored': 'state-change',
        'closed': 'close'
    };

    Object.keys(eventMap).forEach(key => {
        const event = key;
        const bwEvent = eventMap[key];

        const subscription: RemoteSubscriptionProps = {
            uuid: grouping.uuid,
            name: grouping.name,
            listenType: 'on',
            className: 'window',
            eventName: event
        };

        const incomingEvent = route.window(event, grouping.uuid, grouping.name);
        const newEvent = route.externalWindow(bwEvent, identity.uuid, grouping.name);

        const internalListener = (payload: EventPayload) => {
            const newPayload = Object.assign({}, payload);
            newPayload.uuid = identity.uuid;
            ofEvents.emit(newEvent, newPayload);
        };

        ofEvents.on(incomingEvent, internalListener);
        localUnsubscriptions.push(() => ofEvents.removeListener(incomingEvent, internalListener));
        unsubscriptions.push(addRemoteSubscription(subscription));
    });

    Promise.all(unsubscriptions).then(unsubs => {
        const externalWindowClose = route.externalWindow('close', identity.uuid, grouping.name);
        ofEvents.on(externalWindowClose, () => {
            unsubs.forEach(unsub => unsub());
            localUnsubscriptions.forEach(unsub => unsub());
        });
    });
};

// Sets meshGroupUuid on the window in the runtime of the target and returns the nativeId of the window
const setMeshJoinGroup = async (parent: Identity, toGroup: Identity): Promise<APIPayloadAck> => {
    const { uuid, name } = toGroup;
    const parentUuid = parent && parent.uuid;

    const meshJoinGroupMessage = {
        action: 'set-mesh-group-uuid',
        payload: {
            uuid,
            name,
            meshGroupUuid: parentUuid
        }
    };
    const id = await connectionManager.resolveIdentity({uuid});
    return await id.runtime.fin.System.executeOnRemote({uuid, name}, meshJoinGroupMessage);
};

const handleExternalWindow = async (action: string, identity: Identity, toGroup: Identity): Promise<void|Identity> => {
    const { uuid, name } = toGroup;
    // ADD HASH TO NAME - return it to the other window to be stored in groupUuid as external/uuid/name
    if (!uuid || isLocalUuid(uuid)) {
        return;
    }
    const registeredWindow = WindowGroup.getMeshWindow(toGroup);
    if (registeredWindow || action === 'leave-window-group') {
        // External window already created and registered
        return registeredWindow;
    }

    // below call sets meshGroupUuid on the runtime of the target and returns the nativeId of the window
    const nativeIdResponse = await setMeshJoinGroup(identity, toGroup);

    const childWindowOptions = {
        uuid: identity.uuid,
        name,
        hwnd: nativeIdResponse.data,
        meshJoinGroupIdentity: { uuid, name }
    };
    const parent = coreState.getWindowByUuidName(identity.uuid, identity.uuid);
    const parentId = parent && parent.browserWindow && parent.browserWindow.id;
    const childBw = new BrowserWindow(childWindowOptions);
    const childId = childBw && childBw.id;

    if (!coreState.addChildToWin(parentId, childId)) {
        console.warn('failed to add child window');
    }
    Window.create(childId, childWindowOptions);

    meshJoinGroupEvents(identity, toGroup);
    WindowGroup.addMeshWindow(toGroup, childWindowOptions);

    return childWindowOptions;
};

export const meshJoinWindowGroupMiddleware = async (msg: MessagePackage, next: (locals?: object) => void): Promise<void> => {
    const { identity, data, ack, nack } = msg;
    const payload = data && data.payload;
    const action = data && data.action;
    const isJoinWindowGroupAction = action === 'join-window-group' || action === 'leave-window-group';
    const isValidIdentity = typeof (identity) === 'object';
    const optInFlag = coreState.argo['mesh-join-group'];

    if (!isJoinWindowGroupAction || !isValidIdentity || !optInFlag) {
        next();
        return;
    }
    // CHECK TO MAKE SURE WE ARE ON WINDOWS?
    const window: Identity = {
        uuid: payload.uuid,
        name: payload.name
    };
    const grouping: Identity = {
        uuid: payload.groupingUuid,
        name: payload.groupingWindowName
    };

    // If grouping is not local, make sure target window isnt in a group in it's own runtime
    if (grouping.uuid && !isLocalUuid(grouping.uuid)) {
        const getGroupMessage = {
            action: 'get-window-group',
            payload: grouping
        };
        const id = await connectionManager.resolveIdentity({uuid: grouping.uuid});
        const windowGroupResponse = await id.runtime.fin.System.executeOnRemote(identity, getGroupMessage);
        const windowGroup = windowGroupResponse && windowGroupResponse.data;
        if (windowGroup && windowGroup.length) {
            // If it is in a group in another RT - send to its own RT to execute
            id.runtime.fin.System.executeOnRemote(grouping, data)
            .then(ack)
            .catch(nack);
            return;
        }
    }

    // If local grouping window is in a group in another RT, handle in that runtime
    const groupingOfWindow: OpenFinWindow|undefined = coreState.getWindowByUuidName(grouping.uuid, grouping.name);
    if (groupingOfWindow && groupingOfWindow.meshGroupUuid) {
        return await handleExternallyGroupedLocalWindow(groupingOfWindow, msg);
    }

    // If local window leaving group is in a group in another RT, handle in that runtime
    if (action === 'leave-window-group') {
        const ofWindow: OpenFinWindow|undefined = coreState.getWindowByUuidName(window.uuid, window.name);
        if (ofWindow && ofWindow.meshGroupUuid) {
            await handleExternallyGroupedLocalWindow(ofWindow, msg);
            ofWindow.meshGroupUuid = null;
            return;
        }
    }

    let parentIdentity;
    // If local grouping window is in a group locally, see if there are any external windows in the group
    if (groupingOfWindow && groupingOfWindow.groupUuid) {
        const targetGroup = Window.getGroup(grouping);
        if (targetGroup && targetGroup.length) {
            targetGroup.forEach((win: Identity) => {
                // const ofWindow = coreState.getWindowByUuidName(grouping.uuid, grouping.name);
                const ofWindow = coreState.getWindowByUuidName(win.uuid, win.name);
                if (ofWindow._options.meshJoinGroupIdentity) {
                    // there is an external window; delegate new window parent to same app
                    parentIdentity = { uuid: ofWindow.uuid, name: ofWindow.uuid };
                }
            });
        }
    }
    const locals: any = {};
    parentIdentity = parentIdentity || identity;
    try {
        locals.hwnd = await handleExternalWindow(action, parentIdentity, window);
        locals.groupingHwnd = await handleExternalWindow(action, parentIdentity, grouping);
        next(locals);
    } catch (err) {
        log.writeToLog('info', err);
        nack(err);
    }
};
