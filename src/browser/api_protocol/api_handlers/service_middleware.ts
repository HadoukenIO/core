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
import { Identity, ServiceIdentity, OpenFinWindow } from '../../../shapes';
import { MessagePackage } from '../transport_strategy/api_transport_base';
import RequestHandler from '../transport_strategy/base_handler';
import { sendToIdentity } from './api_protocol_base';
import { Service } from '../../api/service';
import { AckFunc, NackFunc } from '../transport_strategy/ack';

interface RemoteAck {
    ack: AckFunc;
    nack: NackFunc;
}

const remoteAckMap: Map<string, RemoteAck> = new Map();
const pendingServiceConnections: Map<string, MessagePackage[]> = new Map();

const SERVICE_API_ACTION = 'send-service-message';
const SERVICE_APP_ACTION = 'process-service-action';
const SERVICE_ACK_ACTION = 'service-ack';

function getAckKey(id: number, identity: Identity): string {
    return `${ id }-${ identity.uuid }`;
}

// If initial connection to a service, don't know Identity yet, only service Name
function setTargetIdentity(identity: Identity, payload: any): { targetIdentity: false | OpenFinWindow, serviceIdentity: ServiceIdentity } {
    const { uuid, name } = payload;
    if (payload.connectAction) {
        const serviceIdentity = Service.getServiceByUuid(uuid);
        const targetIdentity = serviceIdentity && coreState.getWindowByUuidName(serviceIdentity.uuid, serviceIdentity.name);
        return { targetIdentity, serviceIdentity };
    }
    const serviceIdentity = Service.getServiceByUuid(uuid) || Service.getServiceByUuid(identity.uuid);
    const targetIdentity = coreState.getWindowByUuidName(uuid, name);
    return { targetIdentity, serviceIdentity };
}

function waitForService(uuid: string, msg: MessagePackage) {
    if (!Array.isArray(pendingServiceConnections.get(uuid))) {
        pendingServiceConnections.set(uuid, []);
    }
    pendingServiceConnections.get(uuid).push(msg);
}

export function applyPendingServiceConnections(uuid: string) {
    const pendingConnections = pendingServiceConnections.get(uuid);
    if (pendingConnections) {
        pendingConnections.forEach(connectionMsg => {
            handleServiceApiAction(connectionMsg);
        });
    }
}

//this preprocessor will check if the API call is a service action and forward it to the service to handle.
function handleServiceApiAction(msg: MessagePackage, next?: () => void): void {
    const { data, ack, nack, identity } = msg;
    const action = data && data.action;

    if (action === SERVICE_API_ACTION) {
        const payload = data && data.payload || {};
        // If it is an initial connection to a service, don't know identity yet, only service Name
        const { targetIdentity, serviceIdentity } = setTargetIdentity(identity, payload);

        // use to ensure the service / connection exists (unnecessary?)
        const browserWindow = targetIdentity && targetIdentity.browserWindow;
        if (targetIdentity && browserWindow && !browserWindow.isDestroyed()) {
            const { action: serviceAction, payload: messagePayload } = payload;
            const ackKey = getAckKey(data.messageId, identity);
            remoteAckMap.set(ackKey, { ack, nack });

            const ackToSender = {
                action: SERVICE_ACK_ACTION,
                payload: {
                    correlationId: data.messageId,
                    destinationToken: identity,
                    // If it is a connection request, service object placed on ackToSender automatically
                    ...(payload.connectAction ? { payload: serviceIdentity } : {})
                },
                success: true
            };

            //foward the API call to the service or connection.
            sendToIdentity(targetIdentity, {
                action: SERVICE_APP_ACTION,
                payload: {
                    ackToSender,
                    serviceIdentity,
                    senderIdentity: identity,
                    action: serviceAction,
                    payload: messagePayload,
                    // If it is a connection request, let service know with connectAction property
                    ...(payload.connectAction ? { connectAction: true } : {})
                }
            });
        } else if (payload.connectAction && payload.wait) {
            waitForService(payload.uuid, msg);
        } else {
            nack('Error: service connection not found.');
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
                remoteAck.nack(new Error(data.reason || 'Service error'));
            }
            remoteAckMap.delete(ackKey);
        } else {
            nack('Error: Ack failed, initial service message not found.');
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
