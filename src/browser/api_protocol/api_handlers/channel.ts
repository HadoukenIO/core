

import * as apiProtocolBase from './api_protocol_base';
import { ActionSpecMap } from '../shapes';
import { Channel } from '../../api/channel';
import { Identity, APIMessage, ProviderIdentity } from '../../../shapes';
import { AckFunc, NackFunc } from '../transport_strategy/ack';

const successAck = {
    success: true
};

export class ChannelApiHandler {
    private readonly actionMap: ActionSpecMap = {
        'connect-to-channel': this.connectToChannel,
        'create-channel': this.createChannel,
        'get-all-channels': this.getAllChannels,
        'send-channel-message': this.sendChannelMessage,
        'send-channel-result': this.sendChannelResult
    };

    constructor() {
        apiProtocolBase.registerActionMap(this.actionMap);
    }

    private connectToChannel(identity: Identity, message: APIMessage, ack: AckFunc, nack: NackFunc): void {
        const { payload, messageId, locals } = message;

        // Mesh middleware tries to connect to other runtimes by channelName
        if (locals && locals.aggregate) {
            const { aggregate } = locals;
            if (Array.isArray(aggregate) && aggregate.length) {
                const channel = aggregate.filter(c => !!c);
                if (channel.length > 1) {
                    nack(`Runtime Error: More than one channel for channelName ${payload.channelName}`);
                } else {
                    const dataAck = Object.assign({}, successAck, { data: channel[0] });
                    ack(dataAck);
                    return;
                }
            }
        }

        Channel.connectToChannel(identity, payload, messageId, ack, nack);
        //return undefined so that El-IPC does not automatically ack
        return undefined;
    }

    private createChannel(identity: Identity, message: APIMessage, ack: AckFunc, nack: NackFunc): void {
        const { payload, locals } = message;
        const { channelName } = payload;

        let allChannels = Channel.getAllChannels();

        // Mesh middleware gets all channels from other runtimes
        if (locals && locals.aggregate) {
            const { aggregate } = locals;
            allChannels = [...allChannels, ...aggregate];
        }

        const providerIdentity = Channel.createChannel(identity, channelName, allChannels);
        const dataAck = Object.assign({}, successAck, { data: providerIdentity });
        ack(dataAck);
    }

    private getAllChannels(identity: Identity, message: APIMessage, ack: AckFunc, nack: NackFunc): ProviderIdentity[] {
        const { locals } = message;

        let allChannels = Channel.getAllChannels();

        if (locals && locals.aggregate) {
            const { aggregate } = locals;
            allChannels = [...allChannels, ...aggregate];
        }

        return allChannels;
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
