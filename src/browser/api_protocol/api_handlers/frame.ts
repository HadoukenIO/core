/*
Copyright 2017 OpenFin Inc.

Licensed under OpenFin Commercial License you may not use this file except in compliance with your Commercial License.
Please contact OpenFin Inc. at sales@openfin.co to obtain a Commercial License.
*/
import * as apiProtocolBase from './api_protocol_base';

import { Frame } from '../../api/frame';
import { Identity } from '../../../shapes';
import { ActionSpecMap } from '../shapes';


let successAck: object = {
    success: true
};

export class FrameApiHandler {
    private readonly actionMap: ActionSpecMap = {
        'get-frame-info': this.getInfo
    };

    constructor() {
        apiProtocolBase.registerActionMap(this.actionMap);
    }

    private getInfo(identity: Identity, message: any, ack: any) {

        const dataAck: object = {...successAck};
        const frameIdentity: any = apiProtocolBase.getTargetWindowIdentity(message.payload);

        dataAck.data = Frame.getInfo(frameIdentity);
        ack(dataAck);
        // return Frame.getInfo(message.payload);
    }
}