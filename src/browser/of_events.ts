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
import { EventEmitter } from 'events';
import route from '../common/route';

class OFEvents extends EventEmitter {
    constructor() {
        super();
    }

    public emit(routeString: string, payload: any, ...extraArgs: any[]) {
        const tokenizedRoute = routeString.split('/');
        const eventPropagations = new Map<string, any>();
        const data = [payload, ...extraArgs];
        if (tokenizedRoute.length >= 2) {
            const [channel, topic] = tokenizedRoute;
            const uuid = (payload && payload.uuid) || tokenizedRoute[2] || '*';
            const source = tokenizedRoute.slice(2).join('/');
            const envelope = {channel, topic, source, data};

            // Wildcard on all topics of a channel (such as on the system channel)
            super.emit(route(channel, '*'), envelope);

            if (source) {
                // Wildcard on any source of a channel/topic (ex: 'window/bounds-changed/*')
                super.emit(route(channel, topic, '*'), envelope);

                // Wildcard on any channel/topic of a specified source (ex: 'window/*/myUUID-myWindow')
                super.emit(route(channel, '*', source), envelope);
            }
            if (channel === 'window') {
                const propTopic = `window-${topic}`;
                const dontPropagateToSystem = [
                    'auth-requested'
                ];
                eventPropagations.set(route.application(propTopic, uuid), {...payload, type: propTopic, topic: 'application'});
                if (!dontPropagateToSystem.some( x => x === topic)) {
                   eventPropagations.set(route.system(propTopic), {...payload, type: propTopic, topic: 'system'});
                }
            } else if (channel === 'application') {
                const propTopic = `application-${topic}`;
                const appWindowEventsNotOnWindow = [
                    'window-alert-requested',
                    'window-created',
                    'window-end-load',
                    'window-responding',
                    'window-start-load'
                ];
                if (!topic.match(/^window-/)) {
                    eventPropagations.set(route.system(propTopic), { ...payload, type: propTopic, topic: 'system' });
                } else if (appWindowEventsNotOnWindow.some(t => t === topic)) {
                    eventPropagations.set(route.system(topic), {...payload, type: propTopic, topic: 'system'});
                }
            }
        }
        const result = super.emit(routeString, ...data);
        eventPropagations.forEach((payload, eventString) => {
            this.emit(eventString, payload, ...extraArgs);
        });
        return result;
    }

    public subscriber: StringMap = {
        ADDED: 'subscriber-added',
        REMOVED: 'subscriber-removed'
    };
}

interface StringMap {
    [key: string]: string;
}

export default new OFEvents();
