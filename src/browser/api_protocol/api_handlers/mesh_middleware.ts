/*
Copyright 2017 OpenFin Inc.

Licensed under OpenFin Commercial License you may not use this file except in compliance with your Commercial License.
Please contact OpenFin Inc. at sales@openfin.co to obtain a Commercial License.
*/
import { default as RequestHandler } from '../transport_strategy/base_handler';
import { MessagePackage } from '../transport_strategy/api_transport_base';
import * as log from '../../log';
import { default as connectionManager } from '../../connection_manager';
import ofEvents from '../../of_events';

const coreState = require('../../core_state');

const SUBSCRIBE_ACTION = 'subscribe';
const PUBLISH_ACTION = 'publish-message';
const SEND_MESSAGE_ACTION = 'send-message';

//TODO: This is a workaround for a circular dependency issue in the api handler modules.
const apiMessagesToIgnore: any = {
    'publish-message': true,
    'send-message': true,
    'subscribe': true,
    'unsubscribe': true,
    'subscriber-added': true,
    'subscriber-removed': true,
    'subscribe-to-desktop-event': true,
    'unsubscribe-to-desktop-event': true
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

function registerMiddleware (requestHandler: RequestHandler<MessagePackage>): void {
    requestHandler.addPreProcessor(subscriberEventMiddleware);
    requestHandler.addPreProcessor(publishMiddleware);
    requestHandler.addPreProcessor(sendMessageMiddleware);
    requestHandler.addPreProcessor(ferryActionMiddleware);
}

export { registerMiddleware };
