
const errors = require('../../../common/errors');

export class AckMessage {
    public readonly action: string = 'ack';
    public correlationId: number;
    public payload: AckPayload | NackPayload;
}

// ToDo following duplicated in src/shapes.ts

export class AckPayload {
    public success: boolean;
    public data?: any;

    constructor(data: any) {
        this.data = data;
        this.success = true;
    }
}

export class NackPayload {
    public success: false;
    public reason?: string = '';
    public error?: Error = null;

    constructor(error: string | Error) {
        if (typeof error === 'string') {
            this.reason = error;
        } else {
            const errorObject = errors.errorToPOJO(error);
            this.reason = errorObject.toString();
            this.error = errorObject;
        }
    }
}

export type AckFunc = (payload: AckPayload | NackPayload) => void;

export type NackFunc = (error: string | Error) => void;

export interface RemoteAck {
    ack: AckFunc;
    nack: NackFunc;
}
