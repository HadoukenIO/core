/*
Copyright 2017 OpenFin Inc.

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

import RequestHandler from '../transport_strategy/base_handler';
import { MessagePackage } from '../transport_strategy/api_transport_base';
import * as log from '../../log';
import { sendToIdentity } from './api_protocol_base';
import { Identity } from '../../../shapes';
import { NackPayload, AckFunc, NackFunc } from '../transport_strategy/ack';

const coreState = require('../../core_state');

interface RemoteAck {
    ack: AckFunc;
    nack: NackFunc;
}

const validExternalAPIActions: any = {
   'blur-window': true,
   'bring-window-to-front': true,
   'close-window': true,
   'focus-window': true,
   'hide-window': true,
   'maximize-window': true,
   'minimize-window': true,
   'move-window-by': true,
   'move-window': true,
   'resize-window-by': true,
   'resize-window': true,
   'restore-window': true,
   'show-window': true,
   'show-at-window': true,
   'set-foreground-window': true
};

const remoteAckMap: Map<string, RemoteAck> = new Map();
const EXTERNAL_APP_ACTION = 'process-external-app-action';
const EXTERNAL_ACK_ACTION = 'external-ack';
const LEGACY_WINDOW_FLAG = 'enabled-deprecated-external-windowing';

function getAckKey(id: number, uuid: string): string {
    return `${ id }-${ uuid }`;
}

//this preprocessor will check if the API call is a supported 'Window' action targetting an external connection
//and forward it for the external adaper to handle.
//example move-window, focus-window
function handleExternalApiAction(msg: MessagePackage, next: () => void): void {
    const { data, ack, nack, identity } = msg;
    const payload = data && data.payload;
    const uuid = payload && payload.uuid;
    const name = payload && payload.name;
    const action = data && data.action;

    //the target of this API call is a window.
    if (name && uuid && validExternalAPIActions[action]) {
        const externalConn = coreState.getExternalAppObjByUuid(uuid);
        const ackKey = getAckKey(data.messageId, identity.uuid);

        //this "Window" maps to an external connection.
        if (externalConn) {

            //store the ack/nack combo for when the external connection acks/nacks.
            remoteAckMap.set(ackKey, { ack, nack });

            //foward the API call to the external connection.
            sendToIdentity({ uuid: externalConn.uuid }, {
                action: EXTERNAL_APP_ACTION,
                payload: {
                    action,
                    messageId: data.messageId,
                    payload,
                    destinationToken: identity.uuid
                }
            });
        } else {
            next();
        }
    } else {
        next();
    }
}

//this preprocessor will check if the API call is an 'ack' action from an external connection and tie it to a ExternalApiAction.
function handleExternalAckAction(msg: MessagePackage, next: () => void): void {
    const { data, nack } = msg;
    const action = data && data.action;

    if (action === EXTERNAL_ACK_ACTION) {
        const uuid = data.destinationToken;
        const ackKey = getAckKey(data.correlationId, uuid);
        const remoteAck = remoteAckMap.get(ackKey);

        if (remoteAck) {
            if (data.success) {
                remoteAck.ack({
                    success: true
                });
            } else {
                remoteAck.nack(new Error(data.reason));
            }
            remoteAckMap.delete(ackKey);
        } else {
            next();
        }

    } else {
        next();
    }
}

function registerMiddleware (requestHandler: RequestHandler<MessagePackage>): void {
    requestHandler.addPreProcessor(handleExternalApiAction);
    requestHandler.addPreProcessor(handleExternalAckAction);
}

function legacyWindowingEnabled(): boolean {
    const enabled = coreState.argo[LEGACY_WINDOW_FLAG];
    return enabled !== void 0;
}

export { registerMiddleware, legacyWindowingEnabled };
