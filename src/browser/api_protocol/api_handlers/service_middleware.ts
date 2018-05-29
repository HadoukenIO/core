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

import { getWindowByUuidName, getExternalOrOfWindowIdentity } from '../../core_state';
import { Identity, OpenFinWindow, ServiceIdentity } from '../../../shapes';
import { MessagePackage } from '../transport_strategy/api_transport_base';
import { RemoteAck } from '../transport_strategy/ack';
import RequestHandler from '../transport_strategy/base_handler';
import { sendToIdentity } from './api_protocol_base';
import { Service } from '../../api/service';

const SERVICE_API_ACTION = 'send-service-message';
const SERVICE_APP_ACTION = 'process-service-action';
const SERVICE_ACK_ACTION = 'service-ack';

interface TargetIdentity {
    targetIdentity: ServiceIdentity|void;
    serviceIdentity: ServiceIdentity;
}

const remoteAckMap: Map<string, RemoteAck> = new Map();
const pendingServiceConnections: Map<string, MessagePackage[]> = new Map();

function getAckKey(id: number, identity: Identity): string {
    return `${ id }-${ identity.uuid }-${ identity.name }`;
}

function waitForServiceRegistration(uuid: string, msg: MessagePackage): void {
    if (!Array.isArray(pendingServiceConnections.get(uuid))) {
        pendingServiceConnections.set(uuid, []);
    }
    pendingServiceConnections.get(uuid).push(msg);
}

export function applyPendingServiceConnections(uuid: string): void {
    const pendingConnections = pendingServiceConnections.get(uuid);
    if (pendingConnections) {
        pendingConnections.forEach(connectionMsg => {
            handleServiceApiAction(connectionMsg);
        });
        pendingServiceConnections.delete(uuid);
    }
}

function setTargetIdentity(identity: Identity, payload: any): TargetIdentity {
    const { uuid, name } = payload;
    if (payload.connectAction) {
        // If initial connection to a service, identity may exist but not be registered;
        const serviceIdentity = Service.getServiceByUuid(uuid);
        const targetIdentity = serviceIdentity && getExternalOrOfWindowIdentity(serviceIdentity);
        return { targetIdentity, serviceIdentity };
    }
    // Sender could be service or client, want service Identity sent in payload either way
    let serviceIdentity = Service.getServiceByUuid(uuid) || Service.getServiceByUuid(identity.uuid);
    if (!serviceIdentity && identity.runtimeUuid) {
        serviceIdentity = identity;
    }
    const targetIdentity = getExternalOrOfWindowIdentity(payload);
    return { targetIdentity, serviceIdentity };
}

// This preprocessor will check if the API call is a service action and forward it to the service or client to handle.
function handleServiceApiAction(msg: MessagePackage, next?: () => void): void {
    const { data, ack, nack, identity } = msg;
    const action = data && data.action;

    if (action === SERVICE_API_ACTION) {
        const payload = data && data.payload || {};

        const { targetIdentity, serviceIdentity } = setTargetIdentity(identity, payload);

        // ensure the service / connection exists
        if (targetIdentity) {
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

            // Forward the API call to the service or connection.
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
            // Service not yet registered, hold connection request
            waitForServiceRegistration(payload.uuid, msg);
        } else {
            nack('Service connection not found.');
        }
    } else {
        next();
    }
}

// This preprocessor will check if the API call is an 'ack' action from a service and match it to the original request.
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
            nack('Ack failed, initial service message not found.');
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
