
import { getExternalOrOfWindowIdentity } from '../../core_state';
import { Identity, ProviderIdentity } from '../../../shapes';
import { MessagePackage } from '../transport_strategy/api_transport_base';
import { RemoteAck } from '../transport_strategy/ack';
import RequestHandler from '../transport_strategy/base_handler';
import { sendToIdentity } from './api_protocol_base';
import { Channel } from '../../api/channel';

const CHANNEL_API_ACTION = 'send-channel-message';
const CHANNEL_APP_ACTION = 'process-channel-message';
const CHANNEL_ACK_ACTION = 'send-channel-result';
const CHANNEL_CONNECT_ACTION = 'connect-to-channel';

const isChannelAction = (action: string): boolean => {
    return action === CHANNEL_API_ACTION || action === CHANNEL_CONNECT_ACTION;
};

const isChannelAckAction = (action: string): boolean => {
    return action === CHANNEL_ACK_ACTION;
};

const isConnectAction = (action: string): boolean => {
    return action === CHANNEL_CONNECT_ACTION;
};

interface TargetIdentity {
    targetIdentity: ProviderIdentity|void;
    providerIdentity: ProviderIdentity;
}

const remoteAckMap: Map<string, RemoteAck> = new Map();
const pendingChannelConnections: Map<string, MessagePackage[]> = new Map();

function getAckKey(id: number, identity: Identity): string {
    return `${ id }-${ identity.uuid }-${ identity.name }`;
}

function waitForChannelRegistration(uuid: string, msg: MessagePackage): void {
    if (!Array.isArray(pendingChannelConnections.get(uuid))) {
        pendingChannelConnections.set(uuid, []);
    }
    pendingChannelConnections.get(uuid).push(msg);
}

export function applyPendingChannelConnections(uuid: string): void {
    const pendingConnections = pendingChannelConnections.get(uuid);
    if (pendingConnections) {
        pendingConnections.forEach(connectionMsg => {
            handleChannelApiAction(connectionMsg);
        });
        pendingChannelConnections.delete(uuid);
    }
}

function setTargetIdentity(identity: Identity, data: any): TargetIdentity {
    const { action, payload, payload: { uuid } } = data;
    if (isConnectAction(action)) {
        // If initial connection to a channel, identity may exist but not be registered;
        const providerIdentity = Channel.getChannelByUuid(uuid);
        const targetIdentity = providerIdentity && getExternalOrOfWindowIdentity(providerIdentity);
        return { targetIdentity, providerIdentity };
    }
    // Sender could be channel or client, want channel Identity sent in payload either way
    let { providerIdentity } = payload;
    // Need this for backward compatibility - adapters did not send Channel Identity in first iteration
    providerIdentity = providerIdentity || Channel.getChannelByUuid(uuid) || Channel.getChannelByUuid(identity.uuid) || identity;
    const targetIdentity = getExternalOrOfWindowIdentity(payload);
    return { targetIdentity, providerIdentity };
}

// This preprocessor will check if the API call is a channel action and forward it to the channel or client to handle.
function handleChannelApiAction(msg: MessagePackage, next?: () => void): void {
    const { data, ack, nack, identity } = msg;
    const action = data && data.action;

    if (isChannelAction(action)) {
        const payload = data && data.payload || {};

        const { targetIdentity, providerIdentity } = setTargetIdentity(identity, data);

        // ensure the channel / connection exists
        if (targetIdentity) {
            const { action: channelAction, payload: messagePayload } = payload;
            const ackKey = getAckKey(data.messageId, identity);
            remoteAckMap.set(ackKey, { ack, nack });

            const ackToSender = {
                action: CHANNEL_ACK_ACTION,
                payload: {
                    correlationId: data.messageId,
                    destinationToken: identity,
                    // If it is a connection request, channel object placed on ackToSender automatically
                    ...(isConnectAction(action) ? { payload: providerIdentity } : {})
                },
                success: true
            };

            // Forward the API call to the channel or connection.
            sendToIdentity(targetIdentity, {
                action: CHANNEL_APP_ACTION,
                payload: {
                    ackToSender,
                    providerIdentity,
                    senderIdentity: identity,
                    action: channelAction,
                    payload: messagePayload,
                    // If it is a connection request, let channel know with connectAction property
                    ...(isConnectAction(action) ? { connectAction: true } : {})
                }
            });
        } else if (isConnectAction(action) && payload.wait) {
            // Channel not yet registered, hold connection request
            waitForChannelRegistration(payload.uuid, msg);
        } else {
            nack('Channel connection not found.');
        }
    } else {
        next();
    }
}

// This preprocessor will check if the API call is an 'ack' action from a channel and match it to the original request.
function handleChannelAckAction(msg: MessagePackage, next: () => void): void {
    const { data, nack } = msg;
    const action = data && data.action;

    if (action === CHANNEL_ACK_ACTION) {
        const payload = data && data.payload || {};
        const { destinationToken, correlationId, payload: ackPayload } = payload;
        const ackKey = getAckKey(correlationId, destinationToken);
        const remoteAck = remoteAckMap.get(ackKey);

        if (remoteAck) {
            if (data.success) {
                remoteAck.ack({
                    success: true,
                    ...(ackPayload ? { data: ackPayload } : {})
                });
            } else {
                remoteAck.nack(new Error(data.reason || 'Channel error'));
            }
            remoteAckMap.delete(ackKey);
        } else {
            nack('Ack failed, initial channel message not found.');
        }
    } else {
        next();
    }
}

function registerMiddleware (requestHandler: RequestHandler<MessagePackage>): void {
    requestHandler.addPreProcessor(handleChannelApiAction);
    requestHandler.addPreProcessor(handleChannelAckAction);
}

export { registerMiddleware };
