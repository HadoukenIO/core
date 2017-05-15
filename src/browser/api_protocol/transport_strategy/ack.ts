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

export class AckPayload {
    public readonly success: boolean = true;
    public data: any;

    constructor(data: any) {
        this.data = data;
    }
}

export class NackPayload {
    public readonly success: boolean = false;
    public reason: string = '';
    public error: Error = null;

    constructor(error: string | Error) {
        if (typeof (error) === 'string') {
            this.reason = error;
        } else {
            const errorObject = errors.errorToPOJO(error);
            this.reason = errorObject.toString();
            this.error = errorObject;
        }
    }
}

export interface AckFunc {
    (payload: AckPayload | NackPayload): void;
}
