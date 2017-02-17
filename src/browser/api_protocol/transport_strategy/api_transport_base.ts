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
import { NackPayloadTemplate, AckFunc } from './ack';
import {default as RequestHandler} from './base_handler';
declare var require: any;

const errors = require('../../../common/errors');

export interface ActionMap {
    [key: string]: Function;
}

/**
 * This represents the raw data that comes off the wire as well as the ack and
 * nack functions that get created at the strategy (elipc, ws, etc)
 */
export interface MessagePackage {
    identity: any;
    data: any;
    ack: any;
    nack: any;
    e?: any;
}

export abstract class ApiTransportBase<T> {

    protected requestHandler: RequestHandler<T>;
    protected actionMap: ActionMap;

    constructor (actionMap: ActionMap, requestHandler: RequestHandler<T>) {
        this.actionMap  = actionMap;
        this.requestHandler = requestHandler;
    }

    public abstract registerMessageHandlers(actionMap: ActionMap): void;

    public abstract send(identity: any, payload: any): void

    public abstract onClientAuthenticated(cb: Function): void;

    public abstract onClientDisconnect(cb: Function): void;

    protected abstract onMessage(id: number, data: any): void;

    protected abstract ackDecorator(id: number, messageId: number): AckFunc;

    protected abstract ackDecoratorSync(e: any, messageId: number): AckFunc;

    protected nackDecorator(ackFunction: AckFunc): AckFunc {
        return (err: any) => {
            const payload = new NackPayloadTemplate();

            if (typeof(err) === 'string') {
                payload.reason = err;
            } else {
                const errorObject = errors.errorToPOJO(err);
                payload.reason = errorObject.toString();
                payload.error = errorObject;
            }
            ackFunction(payload);
        };
    }
}
