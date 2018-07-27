

import * as apiProtocolBase from './api_protocol_base';
import { ActionSpecMap } from '../shapes';
import { Channel } from '../../api/channel';
import { Identity, APIMessage } from '../../../shapes';
import { AckFunc, NackFunc } from '../transport_strategy/ack';

const successAck = {
    success: true
};

export class ChannelApiHandler {
    private readonly actionMap: ActionSpecMap = {
        'create-channel': this.createChannel,
        'connect-to-channel': this.connectToChannel,
        'send-channel-message': this.sendChannelMessage,
        'send-channel-result': this.sendChannelResult
    };

    constructor() {
        apiProtocolBase.registerActionMap(this.actionMap);
    }

    private createChannel(identity: Identity, message: APIMessage, ack: AckFunc): void {
        const { payload } = message;
        const { channelName } = payload;

        const providerIdentity = Channel.createChannel(identity, channelName);
        const dataAck = Object.assign({}, successAck, { data: providerIdentity });
        ack(dataAck);
    }

    private connectToChannel(identity: Identity, message: APIMessage, ack: AckFunc, nack: NackFunc): void {
        const { payload, messageId } = message;

        Channel.connectToChannel(identity, payload, messageId, ack, nack);
        //return undefined so that El-IPC does not automatically ack
        return undefined;
    }

    private sendChannelMessage(identity: Identity, message: APIMessage, ack: AckFunc, nack: NackFunc): void {
        const { payload, messageId } = message;

        Channel.sendChannelMessage(identity, payload, messageId, ack, nack);
        //return undefined so that El-IPC does not automatically ack
        return undefined;
    }

    private sendChannelResult(identity: Identity, message: APIMessage, ack: AckFunc, nack: NackFunc): void {
        const { payload } = message;

        Channel.sendChannelResult(identity, payload, ack, nack);
        //return undefined so that El-IPC does not automatically ack
        return undefined;
    }
}
