/*
Copyright 2018 OpenFin Inc.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { applyPendingServiceConnections } from '../api_protocol/api_handlers/service_middleware';
import { Identity, ServiceIdentity, EventPayload } from '../../shapes';
import ofEvents from '../of_events';
import route from '../../common/route';
import { getExternalOrOfWindowIdentity } from '../core_state';

const serviceMap: Map<string, ServiceIdentity> = new Map();
let serviceId = 1;

export module Service {
    export function addEventListener(targetIdentity: Identity, type: string, listener: (eventPayload: EventPayload) => void) : () => void {
        const eventString = route.service(type, targetIdentity.uuid);
        ofEvents.on(eventString, listener);

        return () => {
            ofEvents.removeListener(eventString, listener);
        };
    }

    export function getServiceByChannelId(channelId: string): ServiceIdentity {
        return serviceMap.get(channelId);
    }

    // Could be any identifier
    export function getServiceByUuid(uuid: string): ServiceIdentity {
        let serviceIdentity;
        serviceMap.forEach(service => {
            if (service.uuid === uuid) {
                serviceIdentity = service;
            }
        });
        return serviceIdentity;
    }

    export function registerService (identity: Identity, serviceName?: string): ServiceIdentity {
        const targetApp = getExternalOrOfWindowIdentity(identity);
        // If a service is already registered from that uuid, nack
        if (!targetApp || getServiceByUuid(identity.uuid)) {
            const nackString = 'Register Failed: Please note that only one service may be registered per application.';
            throw new Error(nackString);
        }
        const { uuid, isExternal } = targetApp;
        const channelId = `${uuid}/${serviceId}`;
        const serviceIdentity = { ...targetApp, serviceName, channelId };
        serviceId = serviceId + 1;

        serviceMap.set(channelId, serviceIdentity);

        // When service exits, remove from serviceMap
        const eventString = isExternal ? route.externalApplication('closed', uuid) : route.application('closed', uuid);
        ofEvents.once(eventString, () => {
            serviceMap.delete(channelId);
            ofEvents.emit(route.service('disconnected', uuid), serviceIdentity);
        });

        ofEvents.emit(route.service('connected', uuid), serviceIdentity);

        // execute requests to connect for service that occured before service registration. Timeout ensures registration concludes first.
        setTimeout(() => {
            applyPendingServiceConnections(uuid);
        }, 1);

        return serviceIdentity;
    }
}
