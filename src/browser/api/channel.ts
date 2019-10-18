
import { Identity, ProviderIdentity, EventPayload } from '../../shapes';
import ofEvents from '../of_events';
import route from '../../common/route';
import { AckFunc, NackFunc, AckMessage, AckPayload, NackPayload } from '../api_protocol/transport_strategy/ack';
import { sendToIdentity } from '../api_protocol/api_handlers/api_protocol_base';
import { getEntityIdentity } from '../core_state';
import SubscriptionManager from '../subscription_manager';
import {app as electronApp} from 'electron';

const subscriptionManager = new SubscriptionManager();
const channelMap: Map<string, ProviderIdentity> = new Map();

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
        if (Channel.getChannelByChannelName(channelName, allChannels)) {
            // If a channel has already been created with that channelName
            const nackString = 'Channel creation failed: Please note that only one channel may be registered per channelName.';
            throw new Error(nackString);
        }

        const providerApp = getEntityIdentity(identity);
        const channelId = electronApp.generateGUID();
        const providerIdentity = { ...providerApp, channelName, channelId };
        channelMap.set(channelId, providerIdentity);

        // Handled reloaded and navigation events
        const { uuid, name } = providerIdentity;
        const unloadEvent = route.window('unload', uuid, name, false);
        const unloadListener = () => subscriptionManager.removeSubscription(identity, channelId);
        ofEvents.once(unloadEvent, unloadListener);

        // Handle close events with subscription manager
        const onCloseListener = () => {
            channelMap.delete(channelId);
            ofEvents.emit(route.channel('disconnected'), providerIdentity);
            // Need channel-disconnected for compatibility with 9.61.34.*
            ofEvents.emit(route.channel('channel-disconnected'), providerIdentity);
            ofEvents.removeListener(unloadEvent, unloadListener);
        };
        // register subscription to later unsubscribe and ensure disconnect fires on window or external-application close
        subscriptionManager.registerSubscription(onCloseListener, identity, channelId);

        // Used internally by adapters for pending connections and onChannelConnect
        ofEvents.emit(route.channel('connected'), providerIdentity);
        // Need channel-connected for compatibility with 9.61.34.*
        ofEvents.emit(route.channel('channel-connected'), providerIdentity);

        return providerIdentity;
    }

    export function destroyChannel(identity: Identity, channelName: string): void {
        // If a channel has already been created with that channelName
        const channel = Channel.getChannelByChannelName(channelName);
        if (!channel) {
            const nackString = `Channel ${channelName} does not exist.`;
            throw new Error(nackString);
        } else if (channel.uuid !== identity.uuid) {
            const nackString = 'Channel can only be destroyed from application that created it.';
            throw new Error(nackString);
        }

        const { channelId } = channel;

        channelMap.delete(channelId);
        subscriptionManager.removeSubscription(identity, channelId);
    }

    export function disconnectFromChannel(identity: Identity, channelName: string): void {
        const disconnectedEvent = 'client-disconnected';
        subscriptionManager.removeSubscription(identity, `${disconnectedEvent}-${channelName}`);
    }

    export function connectToChannel(identity: Identity, payload: any, messageId: number, ack: AckFunc, nack: NackFunc): void {
        const { channelName, payload: connectionPayload } = payload;
        const providerIdentity = Channel.getChannelByChannelName(channelName);

        if (connectionPayload && connectionPayload.nameAlias) {
            identity.name = connectionPayload.nameAlias;
        }

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

            // handle client reload or navigatation events
            const disconnectedEvent = 'client-disconnected';
            const unloadEvent = route.window('unload', identity.uuid, identity.name, false);
            const unloadListener = () => subscriptionManager.removeSubscription(identity, `${disconnectedEvent}-${channelName}`);
            ofEvents.once(unloadEvent, unloadListener);

            // Handle client close events with subscription manager
            const clientDisconnect = () => {
                const payload = { channelName, ...identity };
                ofEvents.emit(route.channel(disconnectedEvent), payload);
                ofEvents.removeListener(unloadEvent, unloadListener);
            };
            subscriptionManager.registerSubscription(clientDisconnect, identity, `${disconnectedEvent}-${channelName}`);
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
        const intendedTargetIdentity = { uuid, name };

        if (messagePayload && messagePayload.nameAlias) {
            identity.name = messagePayload.nameAlias;
        }

        const ackToSender = createAckToSender(identity, messageId, providerIdentity);

        sendToIdentity(intendedTargetIdentity, {
            action: CHANNEL_APP_ACTION,
            payload: {
                ackToSender,
                providerIdentity,
                action: channelAction,
                senderIdentity: identity,
                payload: messagePayload,
                intendedTargetIdentity
            }
        });
    }

    // This preprocessor will check if the API call is an 'ack' action from a channel and match it to the original request.
    export function sendChannelResult(identity: Identity, payload: any, ack: AckFunc, nack: NackFunc): void {
        const { reason, success, destinationToken, correlationId, payload: ackPayload } = payload;
        const ackObj = new AckMessage();
        ackObj.correlationId = correlationId;

        if (destinationToken) {
            ackObj.payload = success ? new AckPayload(ackPayload) : new NackPayload(reason);

            if (destinationToken.runtimeUuid) {
                // Was sent from another runtime, ack to runtime not identity
                sendToIdentity({uuid: destinationToken.runtimeUuid}, ackObj);
            } else {
                sendToIdentity(destinationToken, ackObj);
            }
        } else {
            nack('Ack failed, initial channel destinationToken not found.');
        }
    }
}

