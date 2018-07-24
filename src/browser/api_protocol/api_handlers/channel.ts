

import * as apiProtocolBase from './api_protocol_base';
import { ActionSpecMap } from '../shapes';
import { Channel } from '../../api/channel';
import { Identity } from '../../../shapes';

const successAck = {
    success: true
};

export class ChannelApiHandler {
    private readonly actionMap: ActionSpecMap = {
        'create-channel': this.createChannel
    };

    constructor() {
        apiProtocolBase.registerActionMap(this.actionMap);
    }

    private createChannel(identity: Identity, message: any, ack: any, nack: any): void {
        const { payload } = message;
        const { channelName } = payload;

        const providerIdentity = Channel.createChannel(identity, channelName);
        const dataAck = Object.assign({}, successAck, { data: providerIdentity });
        ack(dataAck);
    }

}
