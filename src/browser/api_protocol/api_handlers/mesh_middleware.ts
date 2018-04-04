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
import { Identity } from 'hadouken-js-adapter/out/src/identity';
import { BrowserWindow } from 'electron';
import { Window } from '../../api/window';

const coreState = require('../../core_state');

const SUBSCRIBE_ACTION = 'subscribe';
const PUBLISH_ACTION = 'publish-message';
const SEND_MESSAGE_ACTION = 'send-message';

//TODO: This is a workaround for a circular dependency issue in the api handler modules.
const apiMessagesToIgnore: any = {
    'publish-message': true,
    'send-message': true,
    'subscribe': true,
    'join-window-group': true,
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

const handleExternalWindow = async (identity: Identity, toGroup: Identity) => {
    const { uuid, name } = toGroup;
    try {
        const getHwndMessage = {
            action: 'get-hwnd',
            payload: {
                uuid,
                name
            }
        };
        const id = await connectionManager.resolveIdentity({uuid});
        const hwnd = await id.runtime.fin.System.executeOnRemote(identity, getHwndMessage);

        const childWindowOptions = {
            uuid: identity.uuid,
            name,
            hwnd: hwnd.data
        };
        const parent = coreState.getWindowByUuidName(identity.uuid, identity.name);
        const parentId = parent && parent.browserWindow && parent.browserWindow.id;
        const childId = new BrowserWindow(childWindowOptions).id;

        if (!coreState.addChildToWin(parentId, childId)) {
            console.warn('failed to add child window');
        }
        Window.create(childId, childWindowOptions);

        return hwnd;
    } catch (e) {
        log.writeToLog('info', e);
        return;
    }
};

async function meshJoinWindowGroupMiddleware(msg: MessagePackage, next: (locals?: object) => void) {
    const { identity, data, ack, nack } = msg;
    const payload = data && data.payload;
    const action = data && data.action;
    const isJoinWindowGroupAction = action === 'join-window-group';
    const isLocalAction = !identity.runtimeUuid;
    const isValidIdentity = typeof (identity) === 'object';

    if (!isJoinWindowGroupAction || !isLocalAction || !isValidIdentity) {
        next();
        return;
    }
    // ALSO CHECK TO MAKE SURE WE ARE ON WINDOWS!!!!]
    const window = {
        uuid: payload.uuid,
        name: payload.name
    };
    const grouping = {
        uuid: payload.groupingUuid,
        name: payload.groupingWindowName
    };

    const locals: any = {};

    if (window.uuid !== void(0) && !isLocalUuid(window.uuid)) {
        locals.hwnd = await handleExternalWindow(identity, window) || nack('Could not locate the requested window');
    }
    if (grouping.uuid !== void(0) && !isLocalUuid(grouping.uuid)) {
        locals.groupingHwnd = await handleExternalWindow(identity, grouping) || nack('Could not locate the requested window');
    }

    next(locals);
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
            if (action === 'join-window-group') {
                const win = coreState.getWindowByUuidName(data.payload.groupingUuid, data.payload.groupingWindowName);
                const hwnd = win.browserWindow.nativeId;
                data.payload.hwnd = hwnd;
            }
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

export { registerMiddleware, isLocalUuid };
