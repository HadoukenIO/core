
import { applyPendingChannelConnections } from '../api_protocol/api_handlers/channel_middleware';
import { Identity, ProviderIdentity, EventPayload } from '../../shapes';
import ofEvents from '../of_events';
import route from '../../common/route';
import { getExternalOrOfWindowIdentity } from '../core_state';

const channelMap: Map<string, ProviderIdentity> = new Map();

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
    export function getChannelByUuid(uuid: string): ProviderIdentity {
        let providerIdentity;
        channelMap.forEach(channel => {
            if (channel.uuid === uuid) {
                providerIdentity = channel;
            }
        });
        return providerIdentity;
    }

    export function registerChannel (identity: Identity, channelName?: string): ProviderIdentity {
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
}
