import { NackPayload, AckFunc, NackFunc } from './ack';
import { default as RequestHandler } from './base_handler';
import { ActionMap } from '../shapes';
import { Identity } from '../../../shapes';

export { Identity };

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

// To Do: Refactor api_transport_base.ts and construct implementations per type, per endpoint.
//        Configuration can then be stored per instance.
/* tslint:disable:no-empty-interface*/
export interface MessageConfiguration {}
/* tslint:enable:no-empty-interface*/

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

    protected abstract onMessage(id: any, data: any, ackDelegate: any): void;

    protected abstract ackDecorator(id: number, messageId: number, originalPayload: any, configuration: MessageConfiguration): AckFunc;

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

    protected passwordReplacer(key: string, value: any): any {
        if (key === 'password') {
            return undefined;
        } else {
            return value;
        }
    }

}
