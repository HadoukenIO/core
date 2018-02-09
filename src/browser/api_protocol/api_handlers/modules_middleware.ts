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
import { Identity, Module, OpenFinWindow } from '../../../shapes';
import { MessagePackage } from '../transport_strategy/api_transport_base';
import RequestHandler from '../transport_strategy/base_handler';
import { sendToIdentity } from './api_protocol_base';
import { Modules } from '../../api/modules';
import { AckFunc, NackFunc } from '../transport_strategy/ack';

interface RemoteAck {
    ack: AckFunc;
    nack: NackFunc;
}

const moduleApiActions: any = {
    'send-module-message': true
};

const remoteAckMap: Map<string, RemoteAck> = new Map();
const pendingModuleConnections: Map<string, MessagePackage[]> = new Map();

const MODULE_API_ACTION = 'send-module-message';
const MODULE_APP_ACTION = 'process-module-action';
const MODULE_ACK_ACTION = 'module-ack';

function getAckKey(id: number, identity: Identity): string {
    return `${ id }-${ identity.uuid }`;
}

// If initial connection to a module, don't know Identity yet, only module Name
function setTargetIdentity(identity: Identity, payload: any): { targetIdentity: false | OpenFinWindow, moduleIdentity: Module } {
    const { uuid, name } = payload;
    if (payload.connectAction) {
        const moduleIdentity = Modules.getModuleByUuid(uuid);
        const targetIdentity = moduleIdentity && coreState.getWindowByUuidName(moduleIdentity.uuid, moduleIdentity.name);
        return { targetIdentity, moduleIdentity };
    }
    const moduleIdentity = Modules.getModuleByUuid(uuid) || Modules.getModuleByUuid(identity.uuid);
    const targetIdentity = coreState.getWindowByUuidName(uuid, name);
    return { targetIdentity, moduleIdentity };
}

function waitForModule(uuid: string, msg: MessagePackage) {
    if (!Array.isArray(pendingModuleConnections.get(uuid))) {
        pendingModuleConnections.set(uuid, []);
    }
    pendingModuleConnections.get(uuid).push(msg);
}

export function applyPendingModuleConnections(uuid: string) {
    const pendingConnections = pendingModuleConnections.get(uuid);
    if (pendingConnections) {
        pendingConnections.forEach(connectionMsg => {
            handleModuleApiAction(connectionMsg);
        });
    }
}

//this preprocessor will check if the API call is a module action and forward it to the module to handle.
function handleModuleApiAction(msg: MessagePackage, next?: () => void): void {
    const { data, ack, nack, identity } = msg;
    const action = data && data.action;

    if (action === MODULE_API_ACTION) {
        const payload = data && data.payload || {};
        // If it is an initial connection to a module, don't know identity yet, only module Name
        const { targetIdentity, moduleIdentity } = setTargetIdentity(identity, payload);

        // use to ensure the module / connection exists (unnecessary?)
        const browserWindow = targetIdentity && targetIdentity.browserWindow;
        if (targetIdentity && browserWindow && !browserWindow.isDestroyed()) {
            const { action: moduleAction, payload: messagePayload } = payload;
            const ackKey = getAckKey(data.messageId, identity);
            remoteAckMap.set(ackKey, { ack, nack });

            const ackToSender = {
                action: MODULE_ACK_ACTION,
                payload: {
                    correlationId: data.messageId,
                    destinationToken: identity,
                    // If it is a connection request, module object placed on ackToSender automatically
                    ...(payload.connectAction ? { payload: moduleIdentity } : {})
                },
                success: true
            };

            //foward the API call to the module or connection.
            sendToIdentity(targetIdentity, {
                action: MODULE_APP_ACTION,
                payload: {
                    ackToSender,
                    moduleIdentity,
                    senderIdentity: identity,
                    action: moduleAction,
                    payload: messagePayload,
                    // If it is a connection request, let module know with connectAction property
                    ...(payload.connectAction ? { connectAction: true } : {})
                }
            });
        } else if (payload.connectAction && payload.wait) {
            waitForModule(payload.uuid, msg);
        } else {
            nack('Error: module connection not found.');
        }
    } else {
        next();
    }
}

//this preprocessor will check if the API call is an 'ack' action from a module and tie it to the original request.
function handleModuleAckAction(msg: MessagePackage, next: () => void): void {
    const { data, nack } = msg;
    const action = data && data.action;

    if (action === MODULE_ACK_ACTION) {
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
                remoteAck.nack(new Error(data.reason || 'Module error'));
            }
            remoteAckMap.delete(ackKey);
        } else {
            nack('Error: Ack failed, initial module message not found.');
        }
    } else {
        next();
    }
}

function registerMiddleware (requestHandler: RequestHandler<MessagePackage>): void {
    requestHandler.addPreProcessor(handleModuleApiAction);
    requestHandler.addPreProcessor(handleModuleAckAction);
}

export { registerMiddleware };
