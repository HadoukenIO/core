
import { Identity, ProviderIdentity, EventPayload } from '../../shapes';
import ofEvents from '../of_events';
import route from '../../common/route';
import { RemoteAck, AckFunc, NackFunc, AckMessage, AckPayload, NackPayload } from '../api_protocol/transport_strategy/ack';
import { sendToIdentity } from '../api_protocol/api_handlers/api_protocol_base';
import { getExternalOrOfWindowIdentity } from '../core_state';
import SubscriptionManager from '../subscription_manager';

const subscriptionManager = new SubscriptionManager();
const channelMap: Map<string, ProviderIdentity> = new Map();
const pendingChannelConnections: Map<string, any[]> = new Map();

const CHANNEL_APP_ACTION = 'process-channel-message';
const CHANNEL_ACK_ACTION = 'send-channel-result';
const CHANNEL_CONNECT_ACTION = 'process-channel-connection';

interface AckToSender {
    action: string;
    payload: {
        correlationId: number;
        destinationToken: Identity;
        payload: ProviderIdentity&any;
        success: boolean
    };
}

const getChannelId = (identity: Identity, channelName: string): string => {
    const { uuid, name } = identity;
    return `${uuid}/${name}/${channelName}`;
};

const createAckToSender = (identity: Identity, messageId: number, providerIdentity: ProviderIdentity): AckToSender => {
    return {
        action: CHANNEL_ACK_ACTION,
        payload: {
            correlationId: messageId,
            destinationToken: identity,
            payload: providerIdentity,
            success: true
        }
    };
};

const constructOnDisconnection = (providerIdentity: ProviderIdentity): () => void => {
    return () => {
        const { channelId } = providerIdentity;

        channelMap.delete(channelId);
        ofEvents.emit(route.channel('disconnected'), providerIdentity);
        // Need channel-disconnected for compatibility with 9.61.34.*
        ofEvents.emit(route.channel('channel-disconnected'), providerIdentity);
    };
};

export module Channel {
    export function addEventListener(targetIdentity: Identity, type: string, listener: (eventPayload: EventPayload) => void) : () => void {
        const { uuid, name } = targetIdentity;
        const eventString = name ? route.channel(type, uuid, name) : route.channel(type, uuid);
        ofEvents.on(eventString, listener);

        return () => {
            ofEvents.removeListener(eventString, listener);
        };
    }

    export function getAllChannels(): ProviderIdentity[] {
        const allChannels: ProviderIdentity[] = [];
        channelMap.forEach(channel => {
            allChannels.push(channel);
        });
        return allChannels;
    }

    export function getChannelByChannelName(channelName: string, channelArray?: ProviderIdentity[]): ProviderIdentity|undefined {
        let providerIdentity;
        const channels = channelArray || Array.from(channelMap.values());
        channels.forEach((channel: ProviderIdentity) => {
            if (channel.channelName === channelName) {
                providerIdentity = channel;
            }
        });
        return providerIdentity;
    }

    export function createChannel(identity: Identity, channelName: string, allChannels: ProviderIdentity[]): ProviderIdentity {
        // If a channel has already been created with that channelName
        if (Channel.getChannelByChannelName(channelName, allChannels)) {
            const nackString = 'Channel creation failed: Please note that only one channel may be registered per channelName.';
            throw new Error(nackString);
        }

        const providerApp = getExternalOrOfWindowIdentity(identity);
        const channelId = getChannelId(identity, channelName);
        const providerIdentity = { ...providerApp, channelName, channelId };
        channelMap.set(channelId, providerIdentity);

        if (!providerIdentity.isExternal) {
            const { uuid, name } = providerIdentity;
            ofEvents.once(route.window('reloaded', uuid, name), () => ofEvents.emit(route.channel('disconnected'), providerIdentity));
        }
        subscriptionManager.registerSubscription(constructOnDisconnection(providerIdentity), identity, channelId);


        // createChannelTeardown(providerIdentity);
        // Used internally by adapters for pending connections and onChannelConnect
        ofEvents.emit(route.channel('connected'), providerIdentity);
        // Need channel-connected for compatibility with 9.61.34.*
        ofEvents.emit(route.channel('channel-connected'), providerIdentity);

        return providerIdentity;
    }

    export function connectToChannel(identity: Identity, payload: any, messageId: number, ack: AckFunc, nack: NackFunc): void {
        const { channelName, payload: connectionPayload } = payload;

        const providerIdentity = Channel.getChannelByChannelName(channelName);

        if (providerIdentity) {
            const ackToSender = createAckToSender(identity, messageId, providerIdentity);

            // Forward the API call to the channel provider.
            sendToIdentity(providerIdentity, {
                action: CHANNEL_CONNECT_ACTION,
                payload: {
                    ackToSender,
                    providerIdentity,
                    clientIdentity: identity,
                    payload: connectionPayload
                }
            });
        } else if (identity.runtimeUuid) {
            // If has runtimeUuid call originated in another runtime, ack back undefined for mesh middleware purposes
            ack({ success: true });
        } else {
            // Do not change this, checking for this in adapter
            const interimNackMessage = 'internal-nack';
            nack(interimNackMessage);
        }
    }

    export function sendChannelMessage(identity: Identity, payload: any, messageId: number, ack: AckFunc, nack: NackFunc): void {
        const { uuid, name, payload: messagePayload, action: channelAction, providerIdentity } = payload;
        const targetIdentity = { uuid, name };

        const ackToSender = createAckToSender(identity, messageId, providerIdentity);

        sendToIdentity(targetIdentity, {
            action: CHANNEL_APP_ACTION,
            payload: {
                ackToSender,
                providerIdentity,
                action: channelAction,
                senderIdentity: identity,
                payload: messagePayload
            }
        });
    }

    // This preprocessor will check if the API call is an 'ack' action from a channel and match it to the original request.
    export function sendChannelResult(identity: Identity, payload: any, ack: AckFunc, nack: NackFunc): void {
        const { reason, success, destinationToken, correlationId, payload: ackPayload } = payload;
        const ackObj = new AckMessage();
        ackObj.correlationId = correlationId;

        if (destinationToken) {
            if (success) {
                ackObj.payload = new AckPayload(ackPayload);
                sendToIdentity(destinationToken, ackObj);
            } else {
                ackObj.payload = new NackPayload(reason);
                sendToIdentity(destinationToken, ackObj);
            }
        } else {
            nack('Ack failed, initial channel destinationToken not found.');
        }
    }
}

