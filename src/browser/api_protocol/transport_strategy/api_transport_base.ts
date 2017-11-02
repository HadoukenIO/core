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
import { NackPayload, AckFunc, NackFunc } from './ack';
import { default as RequestHandler } from './base_handler';
import { ActionMap } from '../shapes';
import { Identity } from '../../../shapes';

export { Identity };

declare var require: any;

/**
 * This represents the raw data that comes off the wire as well as the ack and
 * nack functions that get created at the strategy (elipc, ws, etc)
 */
export interface MessagePackage {
    identity: Identity; // of the caller
    data: any;
    ack: AckFunc;
    nack: NackFunc;
    e?: any;
    strategyName: any; // ws / elipc
}

export abstract class ApiTransportBase<T> {

    protected requestHandler: RequestHandler<T>;
    protected actionMap: ActionMap;

    constructor (actionMap: ActionMap, requestHandler: RequestHandler<T>) {
        this.actionMap  = actionMap;
        this.requestHandler = requestHandler;
    }

    public abstract registerMessageHandlers(): void;

    public abstract send(identity: any, payload: any): void;

    public abstract onClientAuthenticated(cb: Function): void;

    public abstract onClientDisconnect(cb: Function): void;

    protected abstract onMessage(id: number, data: any): void;

    protected abstract ackDecorator(id: number, messageId: number): AckFunc;

    protected abstract ackDecoratorSync(e: any, messageId: number): AckFunc;

    protected nackDecorator(ackFunction: AckFunc): (err: Error | string) => void {
        return (err: Error | string) => {
            ackFunction(new NackPayload(err));
        };
    }

    protected payloadReplacer(key: string, value: any): any {
        if (key === 'payload') {
            return '***masked payload***';
        } else {
            return value;
        }
    }


}
