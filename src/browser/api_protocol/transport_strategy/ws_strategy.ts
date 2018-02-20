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
import { AckMessage,  AckFunc, AckPayload, NackPayload } from './ack';
import { ApiTransportBase, MessagePackage, Identity } from './api_transport_base';
import { default as RequestHandler } from './base_handler';
import { Endpoint, ActionMap } from '../shapes';
import route from '../../../common/route';
import * as log from '../../log';

declare var require: any;

import { ExternalApplication } from '../../api/external_application';
const socketServer = require('../../transports/socket_server').server;
const system = require('../../api/system').System;

export class WebSocketStrategy extends ApiTransportBase<MessagePackage> {

    constructor(actionMap: ActionMap, requestHandler: RequestHandler<MessagePackage>) {
        super(actionMap, requestHandler);

        this.requestHandler.addHandler((mp: MessagePackage, next: () => void) => {
            const {identity, data, ack, nack, strategyName} = mp;

            if (strategyName !== this.constructor.name) {
                next();
            } else {
                const endpoint: Endpoint = actionMap[data.action];
                if (endpoint) {
                    Promise.resolve()
                        .then(() => endpoint.apiFunc(identity, data, ack, nack))
                        .then(result => {
                            // older action calls will invoke ack internally, newer ones will return a value
                            if (result !== undefined) {
                                ack(new AckPayload(result));
                            }
                        }).catch(err => {
                            ack(new NackPayload(err));
                        });
                }
            }
        });
    }

    public registerMessageHandlers(): void {
        socketServer.on(route.connection('message'), this.onMessage.bind(this));
    }

    public send(externalConnection: any, payload: any): void {
        try {
            log.writeToLog('info', `sent external-adapter <= ${externalConnection.id} ${JSON.stringify(payload)}`);
        } catch (err) {
            /* tslint:disable: no-empty */
        }
        socketServer.send(externalConnection.id, JSON.stringify(payload));
    }

    public onClientAuthenticated(cb: Function): void {
        socketServer.on(route.connection('authenticated'), cb);
    }

    public onClientDisconnect(cb: Function): void {
        socketServer.on(route.connection('close'), cb);
    }

    protected onMessage(id: number, data: any): void {
        const ack = this.ackDecorator(id, data.messageId);
        const nack = this.nackDecorator(ack);
        const requestingConnection = ExternalApplication.getExternalConnectionById(id);
        //Identity can have three states, the requestingConnection, originatorIdentity or null.
        let identity: Identity = null;
        if (requestingConnection) {
            if (data.requestingIdentity) {
                identity = data.requestingIdentity;
                /*
                This is a proxy call.
                identity from proxied runtime mesh calls will be:
                {
                    uuid: string,
                    name: string,
                    runtime: string
                }
                */
                identity.runtimeUuid = requestingConnection.uuid;
            } else {
                identity = { uuid: requestingConnection.uuid, name: requestingConnection.uuid };
            }
        }

        //message payload might contain sensitive data, mask it.
        const replacer = (data.action === 'publish-message' || data.action === 'send-message') ? this.payloadReplacer : null;
        system.debugLog(1, `received external-adapter <= ${id} ${JSON.stringify(data, replacer)}`);

        this.requestHandler.handle({
            data, ack, nack,
            //TODO: Auth code expects identity as a number.
            identity: <any>identity || id,
            strategyName: this.constructor.name
        });
    }

    protected ackDecorator(id: number, messageId: number): AckFunc {
        const ackObj = new AckMessage();
        return (payload: any) => {
            ackObj.payload = payload;
            ackObj.correlationId = messageId;

            // Don't try to send a response/ack using closed/closing websocket, because it will error out anyways.
            // Instead, we are going to print nice error explaining what happened
            if (!socketServer.isConnectionOpen(id)) {
                system.debugLog(1,
                    `Aborted trying to send a response to external-adapter (ID: ${id}). ` +
                    `Message was going to send: ${JSON.stringify(ackObj)}`
                );
                return;
            }

            system.debugLog(1, `sent external-adapter <= ${id} ${JSON.stringify(ackObj)}`);
            socketServer.send(id, JSON.stringify(ackObj));
        };
    }

    protected ackDecoratorSync(e: any, messageId: number): AckFunc {
        throw new Error('Not implemented');
    }
}
