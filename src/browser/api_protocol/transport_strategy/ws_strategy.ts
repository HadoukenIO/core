/*
Copyright 2017 OpenFin Inc.

Licensed under OpenFin Commercial License you may not use this file except in compliance with your Commercial License.
Please contact OpenFin Inc. at sales@openfin.co to obtain a Commercial License.
*/
import { AckTemplate,  AckFunc } from './ack';
import { ApiTransportBase, ActionMap, MessagePackage } from './api_transport_base';
import {default as RequestHandler} from './base_handler';

declare var require: any;

const externalApplication = require('../external_application');
const socketServer = require('../../transports/socket_server').server;
const system = require('../../api/system').System;

export class WebSocketStrategy extends ApiTransportBase<MessagePackage> {

    constructor(actionMap: ActionMap, requestHandler: RequestHandler<MessagePackage>) {
        super(actionMap, requestHandler);

        this.requestHandler.addHandler((mp: MessagePackage, next) => {

            const {identity, data, ack, nack} = mp;
            const action = this.actionMap[data.action];

            if (typeof (action) === 'function') {
                try {
                    action(identity, data, ack, nack);
                } catch (err) {
                    nack(err);
                }
            }
        });
    }

    public registerMessageHandlers(): void {
        socketServer.on('connection/message', this.onMessage.bind(this));
    }

    public send(externalConnection: any, payload: any): void {
        socketServer.send(externalConnection.id, JSON.stringify(payload));
    }

    public onClientAuthenticated(cb: Function): void {
        socketServer.on('connection/authenticated', cb);
    }

    public onClientDisconnect(cb: Function): void {
        socketServer.on('connection/close', cb);
    }

    protected onMessage(id: number, data: any): void {
        const ack = this.ackDecorator(id, data.messageId);
        const nack = this.nackDecorator(ack);
        const requestingConnection = externalApplication.getExternalConnectionById(id);
        const identity = requestingConnection ? { uuid: requestingConnection.uuid, name: requestingConnection.uuid } : null;

        system.debugLog(1, `received external-adapter <= ${id} ${JSON.stringify(data)}`);

        this.requestHandler.handle({
            data, ack, nack,
            identity: identity || id
        });
    }

    protected ackDecorator(id: number, messageId: number): AckFunc {
        const ackObj = new AckTemplate();
        return (payload: any) => {
            ackObj.payload = payload;
            ackObj.correlationId = messageId;

            try {
                // Log all messages when -v=1
                /* tslint:disable: max-line-length */
                system.debugLog(1, `sent external-adapter <= ${id} ${JSON.stringify(ackObj)}`);
            } catch (err) {
                /* tslint:disable: no-empty */
            }

            socketServer.send(id, JSON.stringify(ackObj));
        };
    }

    protected ackDecoratorSync(e: any, messageId: number): AckFunc {
        throw new Error('Not implemented');
    }
}
