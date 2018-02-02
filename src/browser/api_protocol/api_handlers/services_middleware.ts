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
import * as apiProtocolBase from './api_protocol_base';
import * as coreState from '../../core_state';
import { Identity } from '../../../shapes';
import { MessagePackage } from '../transport_strategy/api_transport_base';
import RequestHandler from '../transport_strategy/base_handler';
import { sendToIdentity } from './api_protocol_base';
import { Services } from '../../api/services';
import { AckFunc, NackFunc } from '../transport_strategy/ack';

interface RemoteAck {
    ack: AckFunc;
    nack: NackFunc;
}

const serviceApiActions: any = {
    'connect-to-service': true,
    'send-to-connection': true,
    'send-to-service': true
};

const remoteAckMap: Map<string, RemoteAck> = new Map();
const pendingServiceConnections: Map<string, MessagePackage[]> = new Map();

const CONNECT_TO_SERVICE_ACTION = 'connect-to-service';
const SERVICE_APP_ACTION = 'process-service-action';
const SERVICE_ACK_ACTION = 'service-ack';

function getAckKey(id: number, identity: Identity): string {
    return `${ id }-${ identity.uuid }`;
}

// If initial connection to a service, don't know Identity yet, only service Name
function setTargetIdentity(action: string, payload: any) {
    if (action === CONNECT_TO_SERVICE_ACTION) {
        const serviceName = payload && payload.serviceName;
        return Services.getService(serviceName).identity;
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
        const payload = data && data.payload || {};
        const { serviceName } = payload;

        // If it is an initial connection to a service, don't know identity yet, only service Name
        const targetIdentity = setTargetIdentity(action, payload);
        const ackKey = getAckKey(data.messageId, identity);

        //the service / connection exists
        if (targetIdentity) {
            //store the ack/nack combo for when the service or connection acks/nacks.
            remoteAckMap.set(ackKey, { ack, nack });

            // If serviceName is defined, original request was from connection so respond with service info
            // (update if serviceName not sent on every request from connection)
            const service = Services.getService(serviceName);
            const ackToSender = {
                action: SERVICE_ACK_ACTION,
                payload: {
                    correlationId: data.messageId,
                    destinationToken: identity,
                    ...(service ? { payload: service } : { payload: {} })
                },
                success: true,
                ...(service ? { service } : {})
            };

            //foward the API call to the service or connection.
            sendToIdentity(targetIdentity, {
                action: SERVICE_APP_ACTION,
                payload: {
                    ackToSender,
                    action,
                    destinationToken: identity,
                    messageId: data.messageId,
                    payload
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
        const payload = data && data.payload || {};
        const { destinationToken, correlationId, payload: ackPayload } = payload;
        const ackKey = getAckKey(correlationId, destinationToken);
        const remoteAck = remoteAckMap.get(ackKey);

        if (remoteAck) {
            if (data.success) {
                remoteAck.ack({
                    success: true,
                    ...(ackPayload ? { data: ackPayload } : {})
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
