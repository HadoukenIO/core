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
