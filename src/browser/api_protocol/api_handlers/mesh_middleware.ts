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
import { Identity, OpenFinWindow } from '../../../shapes';
import { BrowserWindow } from 'electron';
import route from '../../../common/route';
import { addRemoteSubscription } from '../../remote_subscriptions';

const { Window } = require('../../api/window');
const coreState = require('../../core_state');
const WindowGroup = require('../../window_groups.js');


const SUBSCRIBE_ACTION = 'subscribe';
const PUBLISH_ACTION = 'publish-message';
const SEND_MESSAGE_ACTION = 'send-message';

//TODO: This is a workaround for a circular dependency issue in the api handler modules.
const apiMessagesToIgnore: any = {
    'publish-message': true,
    'send-message': true,
    'subscribe': true,
    'join-window-group': true,
    'leave-window-group': true,
    'unsubscribe': true,
    'subscriber-added': true,
    'subscriber-removed': true,
    'subscribe-to-desktop-event': true,
    'unsubscribe-to-desktop-event': true
};

const apiMessagesToAggregate: any = {
    'get-all-windows': true,
    'get-all-applications': true,
    'get-all-external-applications': true,
    'process-snapshot': true
};

//TODO: This is a workaround for a circular dependency issue in the api handler modules.
const subscriberTriggeredEvents: any = {
    'subscribe': true,
    'unsubscribe': true
};

function isLocalUuid(uuid: string): Boolean {
    const externalConn = coreState.getExternalAppObjByUuid(uuid);
    const app = coreState.getAppObjByUuid(uuid);

    return externalConn || app ? true : false;
}

//on a InterAppBus subscribe/unsubscribe send a subscriber-added/subscriber-removed event.
function subscriberEventMiddleware(msg: MessagePackage, next: () => void) {
    const { data, identity: { uuid: uuid}, identity } = msg;

    //runtimeUuid as part of the identity means the request originated from a different runtime. We do not want to handle it.
    if (subscriberTriggeredEvents[data.action] && !identity.runtimeUuid) {
        const { payload: { sourceUuid: sourceUuid, topic: topic, destinationWindowName, sourceWindowName }} = data;

        const forwardedAction = data.action === SUBSCRIBE_ACTION ?  ofEvents.subscriber.ADDED : ofEvents.subscriber.REMOVED;
        const subAddedPayload = {
            senderName: sourceWindowName || sourceUuid,
            senderUuid: sourceUuid,
            name: destinationWindowName,
            uuid,
            topic
        };

        connectionManager.resolveIdentity({ uuid: sourceUuid})
        .then((id: any) => {
            return id.runtime.fin.System.executeOnRemote(identity, {
                action: forwardedAction,
                payload: subAddedPayload
            }).catch((e: Error) => {
                //forward subscriber event failed, this should not prevent normal flow.
                log.writeToLog('info', e);
            });
        });
    }
    next();
}

//on an InterAppBuss publish, forward the message to any runtime on the mesh.
function publishMiddleware(msg: MessagePackage, next: () => void) {
    const { data, ack, nack, identity } = msg;

    if (data.action === PUBLISH_ACTION && !identity.runtimeUuid) {

        connectionManager.connections.forEach((peer: any) => {
            peer.fin.System.executeOnRemote(identity, data);
        });
    }
    next();
}

//on a InterAppBus send-message, forward the message to the runtime that owns the uuid.
function sendMessageMiddleware(msg: MessagePackage, next: () => void) {
    const { data, identity, ack, nack } = msg;

    //runtimeUuid as part of the identity means the request originated from a different runtime. We do not want to handle it.
    if (data.action === SEND_MESSAGE_ACTION && !identity.runtimeUuid) {
        const { payload: { destinationUuid } } = data;

        //We own this UUID, handle locally
        if (isLocalUuid(destinationUuid)) {
            next();
        } else {
            connectionManager.resolveIdentity({ uuid: destinationUuid})
            .then((id: any) => {
                id.runtime.fin.System.executeOnRemote(identity, data)
                .then(ack)
                .catch(nack);
            }).catch((e: Error) => {
                //Uuid was not found in the mesh, let local logic go its course
                next();
            });
        }
    } else {
        next();
    }
}

const handleExternalWindow = async (action: string, identity: Identity, toGroup: Identity): Promise<string|void| Identity> => {
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
    const getHwndMessage = {
        action: 'set-mesh-group-uuid',
        payload: {
            uuid,
            name,
            meshGroupUuid: identity.uuid
        }
    };
    const id = await connectionManager.resolveIdentity({uuid});
    const hwnd = await id.runtime.fin.System.executeOnRemote(identity, getHwndMessage);

    const childWindowOptions = {
        uuid: identity.uuid,
        name,
        hwnd: hwnd.data,
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

    WindowGroup.addMeshWindow(toGroup, childWindowOptions);

    return hwnd.data;
};

async function meshJoinWindowGroupMiddleware(msg: MessagePackage, next: (locals?: object) => void): Promise<void> {
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

    let parentIdentity;
    // make sure target window isnt in group in another RT
    if (grouping.uuid && !isLocalUuid(grouping.uuid)) {
        const getGroupMessage = {
            action: 'get-window-group',
            payload: grouping
        };
        const id = await connectionManager.resolveIdentity({uuid: grouping.uuid});
        const windowGroup = await id.runtime.fin.System.executeOnRemote(identity, getGroupMessage);
        if (windowGroup && windowGroup.length) {
            id.runtime.fin.System.executeOnRemote(identity, data)
            .then(ack)
            .catch(nack);
        }
    }
    const groupingOfWindow: OpenFinWindow|undefined = coreState.getWindowByUuidName(grouping.uuid, grouping.name);
    const externalParentUuid = groupingOfWindow && groupingOfWindow.meshGroupUuid;
    if (externalParentUuid) {
        try {
            const id = await connectionManager.resolveIdentity({uuid: groupingOfWindow.meshGroupUuid});
            const message = {...data, groupingUuid: externalParentUuid, groupingWindowName: externalParentUuid };
            id.runtime.fin.System.executeOnRemote({ uuid: externalParentUuid, name: externalParentUuid }, message)
                .then(ack)
                .catch(nack);
            return;
        } catch (e) {
            groupingOfWindow.meshGroupUuid = null;
            next();
        }
    }
    let targetGroup;
    if (groupingOfWindow && groupingOfWindow.groupUuid) {
        targetGroup = Window.getGroup(grouping);
    }
    if (targetGroup && targetGroup.length) {
        targetGroup.forEach((win: Identity) => {
            const ofWindow = coreState.getWindowByUuidName(grouping.uuid, grouping.name);
            if (ofWindow._options.meshJoinGroupIdentity) {
                // delegate to same app as any other external apps if necessary
                parentIdentity = { uuid: ofWindow.uuid, name: ofWindow.uuid };
            }
        });
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
}

//on a non InterAppBus API call, forward the message to the runtime that owns the uuid.
function ferryActionMiddleware(msg: MessagePackage, next: () => void) {
    const { identity, data, ack, nack } = msg;
    const payload = data && data.payload;
    const uuid = payload && payload.uuid;
    const action = data && data.action;

    const isValidUuid = uuid !== void(0);
    const isValidIdentity = typeof (identity) === 'object';
    const isForwardAction = !apiMessagesToIgnore[action];
    const isRemoteEntity = !isLocalUuid(uuid);
    //runtimeUuid as part of the identity means the request originated from a different runtime. We do not want to handle it.
    const isLocalAction = !identity.runtimeUuid;

    if (isValidUuid && isForwardAction  && isValidIdentity && isRemoteEntity && isLocalAction) {
        try {
            connectionManager.resolveIdentity({uuid})
            .then((id: any) => {
                id.runtime.fin.System.executeOnRemote(identity, data)
                .then(ack)
                .catch(nack);
            }).catch((e: Error) => {
                //Uuid was not found in the mesh, let local logic go its course
                next();
            });

        } catch (e) {
            //something failed asking for the remote
            log.writeToLog('info', e);
            next();
        }
    } else {
        // handle local
        next();
    }
}

// On certain system API calls, provide aggregate results from all runtimes on the mesh
function aggregateFromExternalRuntime(msg: MessagePackage, next: (locals?: object) => void) {
    const { identity, data, ack, nack } = msg;
    const action = data && data.action;
    const isAggregateAction = apiMessagesToAggregate[action];
    //runtimeUuid as part of the identity means the request originated from a different runtime. We do not want to handle it.
    const isLocalAction = !identity.runtimeUuid;

    try {
        if (connectionManager.connections.length && isAggregateAction && isLocalAction) {
            Promise.all(connectionManager.connections.map(runtime => runtime.fin.System.executeOnRemote(identity, data)))
            .then(externalResults => {
                const externalRuntimeData = externalResults.reduce((result, runtime) => [...result, ...runtime.data], []);
                const locals = { aggregate: externalRuntimeData };
                next(locals);
            })
            .catch(nack);
        } else {
            next();
        }

    } catch (e) {
        log.writeToLog('info', e);
        next();
    }

}

function registerMiddleware (requestHandler: RequestHandler<MessagePackage>): void {
    requestHandler.addPreProcessor(subscriberEventMiddleware);
    requestHandler.addPreProcessor(publishMiddleware);
    requestHandler.addPreProcessor(sendMessageMiddleware);
    requestHandler.addPreProcessor(meshJoinWindowGroupMiddleware);
    requestHandler.addPreProcessor(ferryActionMiddleware);
    requestHandler.addPreProcessor(aggregateFromExternalRuntime);
}

export { registerMiddleware };
