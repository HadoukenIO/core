/*
Copyright 2018 OpenFin Inc.

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
import { ActionSpecMap } from '../shapes';
import { Service } from '../../api/service';
import { Identity } from '../../../shapes';

const successAck = {
    success: true
};

export class ServiceApiHandler {
    private readonly actionMap: ActionSpecMap = {
        'register-service': this.registerService
    };

    constructor() {
        apiProtocolBase.registerActionMap(this.actionMap);
    }

    private registerService(identity: Identity, message: any, ack: any, nack: any): void {
        const { payload } = message;
        const { serviceName } = payload;

        const serviceIdentity = Service.registerService(identity, serviceName);
        const dataAck = Object.assign({}, successAck, { data: serviceIdentity });
        const nackString = 'Register Failed: Please note that only one service may be registered per application.';
        serviceIdentity ? ack(dataAck) : nack(nackString);
    }

}
