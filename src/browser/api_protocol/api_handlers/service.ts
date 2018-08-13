

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
        ack(dataAck);
    }

}
