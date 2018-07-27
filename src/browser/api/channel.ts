
import { Identity, ProviderIdentity, EventPayload } from '../../shapes';
import ofEvents from '../of_events';
import route from '../../common/route';
import { RemoteAck, AckFunc, NackFunc } from '../api_protocol/transport_strategy/ack';
import { sendToIdentity } from '../api_protocol/api_handlers/api_protocol_base';
import { getExternalOrOfWindowIdentity } from '../core_state';

const channelMap: Map<string, ProviderIdentity> = new Map();
const remoteAckMap: Map<string, RemoteAck> = new Map();
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

export module Channel {
    export function addEventListener(targetIdentity: Identity, type: string, listener: (eventPayload: EventPayload) => void) : () => void {
        const eventString = route.channel(type, targetIdentity.uuid);
        ofEvents.on(eventString, listener);

        return () => {
            ofEvents.removeListener(eventString, listener);
        };
    }

    export function getChannelByChannelId(channelId: string): ProviderIdentity {
        return channelMap.get(channelId);
    }

    // Could be any identifier
<<<<<<< HEAD
    export function getChannelByUuid(uuid: string): ProviderIdentity|undefined {
=======
    export function getChannelByUuid(uuid: string): ProviderIdentity {
>>>>>>> 01d53002ece04dcb1e0c583a000c1283d348cce4
        let providerIdentity;
        channelMap.forEach(channel => {
            if (channel.uuid === uuid) {
                providerIdentity = channel;
            }
        });
        return providerIdentity;
    }

    export function createChannel(identity: Identity, channelName?: string): ProviderIdentity {
        const targetApp = getExternalOrOfWindowIdentity(identity);
        // If a channel is already registered from that uuid, nack
        if (!targetApp || getChannelByUuid(identity.uuid)) {
            const nackString = 'Register Failed: Please note that only one channel may be registered per application.';
            throw new Error(nackString);
        }
        const { uuid, name, isExternal } = targetApp;
        const channelId = `${uuid}/${name}/${channelName}`;
        const providerIdentity = { ...targetApp, channelName, channelId };

        channelMap.set(channelId, providerIdentity);

        // When channel exits, remove from channelMap
        const eventString = isExternal ? route.externalApplication('closed', uuid) : route.application('closed', uuid);
        ofEvents.once(eventString, () => {
            channelMap.delete(channelId);
            ofEvents.emit(route.channel('disconnected', uuid), providerIdentity);
        });

        ofEvents.emit(route.channel('connected', uuid), providerIdentity);

        // execute requests to connect for channel that occured before channel registration. Timeout ensures registration concludes first.
        setTimeout(() => {
            applyPendingChannelConnections(uuid);
        }, 1);

        return providerIdentity;
    }
<<<<<<< HEAD

    export function connectToChannel(identity: Identity, payload: any, messageId: number, ack: AckFunc, nack: NackFunc): ProviderIdentity {
        const { wait, uuid, payload: connectionPayload } = payload;
        const ackKey = getAckKey(messageId, identity);
        const providerIdentity = Channel.getChannelByUuid(uuid);
        if (providerIdentity) {
            remoteAckMap.set(ackKey, { ack, nack });

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
        } else if (wait) {
            // Channel not yet registered, hold connection request
            const message = { identity, payload, messageId, ack, nack };
            waitForChannelRegistration(payload.uuid, message);
        } else {
            nack('Channel connection not found.');
        }
        return providerIdentity;
    }

    export function sendChannelMessage(identity: Identity, payload: any, messageId: number, ack: AckFunc, nack: NackFunc): void {
        const { uuid, name, payload: messagePayload, action: channelAction, providerIdentity } = payload;
        const ackKey = getAckKey(messageId, identity);
        const targetIdentity = { uuid, name };

        remoteAckMap.set(ackKey, { ack, nack });

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
        const ackKey = getAckKey(correlationId, destinationToken);
        const remoteAck = remoteAckMap.get(ackKey);

        if (remoteAck) {
            if (success) {
                remoteAck.ack({
                    success: true,
                    ...(ackPayload ? { data: ackPayload } : {})
                });
            } else {
                remoteAck.nack(new Error(reason || 'Channel provider error'));
            }
            remoteAckMap.delete(ackKey);
        } else {
            nack('Ack failed, initial channel message not found.');
        }
    }
}

function getAckKey (id: number, identity: Identity): string {
    return `${ id }-${ identity.uuid }-${ identity.name }`;
}

function waitForChannelRegistration(uuid: string, message: any): void {
    if (!Array.isArray(pendingChannelConnections.get(uuid))) {
        pendingChannelConnections.set(uuid, []);
    }
    pendingChannelConnections.get(uuid).push(message);
}

function applyPendingChannelConnections(uuid: string): void {
    const pendingConnections = pendingChannelConnections.get(uuid);
    if (pendingConnections) {
        pendingConnections.forEach(connectionMsg => {
            const { identity, payload, messageId, ack, nack } = connectionMsg;
            Channel.connectToChannel(identity, payload, messageId, ack, nack);
        });
        pendingChannelConnections.delete(uuid);
    }
=======
>>>>>>> 01d53002ece04dcb1e0c583a000c1283d348cce4
}
