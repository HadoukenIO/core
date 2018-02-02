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
import { sendToIdentity } from './api_protocol_base';
import { Identity } from '../../../shapes';
import { AckFunc, NackFunc } from '../transport_strategy/ack';
import { Services } from '../../api/services';
import * as apiProtocolBase from './api_protocol_base';
import * as coreState from '../../core_state';

interface RemoteAck {
    ack: AckFunc;
    nack: NackFunc;
}

const serviceApiActions: any = {
    'connect-to-service': true,
    'send-to-service': true,
    'send-to-connection': true
};

const remoteAckMap: Map<string, RemoteAck> = new Map();
const pendingServiceConnections: Map<string, MessagePackage[]> = new Map();
const SERVICE_APP_ACTION = 'process-service-action';
const SERVICE_ACK_ACTION = 'service-ack';
const CONNECT_TO_SERVICE_ACTION = 'connect-to-service';

// Do we need name too?
function getAckKey(id: number, identity: Identity): string {
    return `${ id }-${ identity.uuid }`;
}

// If it is an initial connection to a service, don't know Identity yet, only service Name
function setTargetIdentity(action: string, payload: any) {
    if (action === CONNECT_TO_SERVICE_ACTION) {
        const serviceName = payload && payload.serviceName;
        return Services.getService(serviceName);
    } else {
        return apiProtocolBase.getTargetWindowIdentity(payload);
    }
}

function waitForService(serviceName: string, msg: MessagePackage) {
    if (!Array.isArray(pendingServiceConnections.get(serviceName))) {
        pendingServiceConnections.set(serviceName, []);
    }
    pendingServiceConnections.get(serviceName).push(msg);
}

function applyPendingServiceConnections(serviceName: string) {
    const pendingConnections = pendingServiceConnections.get(serviceName);
    if (pendingConnections) {
        pendingConnections.forEach(connectionMsg => {
            const serviceNack = () => connectionMsg.nack('Error connecting to Service.');
            handleServiceApiAction(connectionMsg, serviceNack);
        });
    }
}

//this preprocessor will check if the API call is a service action and forward it to the service to handle.
function handleServiceApiAction(msg: MessagePackage, next: () => void): void {
    const { data, ack, nack, identity } = msg;
    const action = data && data.action;

    //the target of this API call is a window.
    if (serviceApiActions[action]) {
        const payload = data && data.payload;
        const serviceName = payload && payload.serviceName;

        // If it is an initial connection to a service, don't know identity yet, only service Name
        const targetIdentity = setTargetIdentity(action, payload);
        const ackKey = getAckKey(data.messageId, identity);

        //the service / connection exists
        if (targetIdentity) {
            //store the ack/nack combo for when the service or connection acks/nacks.
            remoteAckMap.set(ackKey, { ack, nack });
            const ackToSender = {
                action: SERVICE_ACK_ACTION,
                payload: {
                    correlationId: data.messageId,
                    destinationToken: identity,
                    payload: {}
                }
            };

            //foward the API call to the service or connection.
            sendToIdentity(targetIdentity, {
                action: SERVICE_APP_ACTION,
                payload: {
                    action,
                    messageId: data.messageId,
                    payload,
                    destinationToken: identity,
                    ackToSender
                }
            });
        } else if (action === CONNECT_TO_SERVICE_ACTION && payload.wait) {
            waitForService(serviceName, msg);
        } else {
            nack('Service connection not found.');
        }
    } else {
        next();
    }
}

//this preprocessor will check if the API call is an 'ack' action from a service and tie it to the original request.
function handleServiceAckAction(msg: MessagePackage, next: () => void): void {
    const { data, nack } = msg;
    const action = data && data.action;

    if (action === SERVICE_ACK_ACTION) {
        const payload = data && data.payload;
        const destinationToken = payload && payload.destinationToken;
        const correlationId = payload && payload.correlationId;
        const ackKey = getAckKey(correlationId, destinationToken);
        const remoteAck = remoteAckMap.get(ackKey);

        if (remoteAck) {
            if (data.success) {
                remoteAck.ack({
                    data: payload,
                    success: true
                });
            } else {
                remoteAck.nack(new Error(data.reason));
            }
            remoteAckMap.delete(ackKey);
        } else {
            nack('Message not found.');
        }
    } else {
        next();
    }
}

function registerMiddleware (requestHandler: RequestHandler<MessagePackage>): void {
    requestHandler.addPreProcessor(handleServiceApiAction);
    requestHandler.addPreProcessor(handleServiceAckAction);
}

export { registerMiddleware };
