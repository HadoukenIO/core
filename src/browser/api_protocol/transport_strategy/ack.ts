
const errors = require('../../../common/errors');

export class AckMessage {
    public readonly action: string = 'ack';
    public breadcrumbs?: Array<any>;
    public correlationId: number;
    public readonly originalAction?: string;
    public payload: AckPayload | NackPayload;

    constructor(breadcrumbs?: Array<any>, originalAction?: string) {
        if (breadcrumbs) {
            this.breadcrumbs = breadcrumbs;
        }

        if (originalAction) {
            this.originalAction = originalAction;
        }
    }

    public addBreadcrumb(name: string, time?: number, messageId?: number): void {
        this.breadcrumbs = this.breadcrumbs || [];

        this.breadcrumbs.push({
            action: this.originalAction,
            messageId: messageId || this.correlationId,
            name,
            time: time || Date.now()
        });
    }
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
            this.reason = error.message;
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
