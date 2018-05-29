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
        serviceMap.forEach((value, key) => {
            if (value.uuid === uuid) {
                serviceIdentity = serviceMap.get(key);
            }
        });
        return serviceIdentity;
    }

    export function registerService (identity: Identity, serviceName?: string): ServiceIdentity | false {
        const serviceIdentity = getExternalOrOfWindowIdentity(identity);
        // If a service is already registered from that uuid, nack
        if (!serviceIdentity || getServiceByUuid(identity.uuid)) {
            return false;
        }
        serviceIdentity.serviceName = serviceName;
        const { uuid, isExternal, ...eventPayload } = serviceIdentity;
        serviceIdentity.channelId = `${uuid}/${serviceId}`;
        serviceId = serviceId + 1;

        serviceMap.set(serviceIdentity.channelId, serviceIdentity);

        // When service exits, remove from serviceMap
        const eventString = isExternal ? route.externalApplication('closed', uuid) : route.application('closed', uuid);
        ofEvents.once(eventString, () => {
            serviceMap.delete(serviceIdentity.channelId);
            ofEvents.emit(route.service('disconnected', uuid), eventPayload);
        });

        ofEvents.emit(route.service('connected', uuid), eventPayload);

        // execute requests to connect for service that occured before service registration. Timeout ensures registration concludes first.
        setTimeout(() => {
            applyPendingServiceConnections(uuid);
        }, 1);

        return serviceIdentity;
    }
}
