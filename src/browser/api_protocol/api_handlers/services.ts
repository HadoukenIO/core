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


import * as apiProtocolBase from './api_protocol_base';
import { ActionSpecMap } from '../shapes';
import { Services } from '../../api/services';
import { Identity } from '../../../shapes';

const successAck = {
    success: true
};

export class ServiceApiHandler {
    private readonly actionMap: ActionSpecMap = {
        'register-service': this.registerService,
        'subscribe-to-service': this.subscribeService
    };

    constructor() {
        apiProtocolBase.registerActionMap(this.actionMap);
    }

    private registerService(identity: Identity, message: any, ack: any, nack: any) {
        // const { payload: { serviceName = null, serviceFunctions = [] } = {} } = message;
        const { payload } = message;
        const { serviceName, serviceFunctions } = payload;

        const serviceRegistered = Services.registerService(identity, serviceName, serviceFunctions);
        const dataAck = Object.assign({}, successAck, { data: serviceRegistered });
        serviceRegistered ? ack(dataAck) : nack('service name already registered');
    }

    private subscribeService(identity: Identity, message: any, ack: any, nack: any) {
        // const { payload: { serviceName = null } = {} } = message;
        const { payload } = message;
        const { serviceName } = payload;
        const service = Services.getService(serviceName);
        const dataAck = Object.assign({}, successAck, { data: service });
        service ? ack(dataAck) : nack('Requested service not registered');
    }
}
