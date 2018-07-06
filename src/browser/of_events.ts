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

    public emit(routeString: string, ...data: any[]) {
        const tokenizedRoute = routeString.split('/');
        const eventPropagations = new Map<string, any>();
        const [payload, ...extraArgs] = data;
        if (tokenizedRoute.length >= 2) {
            const [channel, topic] = tokenizedRoute;
            const uuid: string = (payload && payload.uuid) || tokenizedRoute[2] || '*';
            const source = tokenizedRoute.slice(2).join('/');
            const envelope = { channel, topic, source, data };
            const propagateToSystem = !topic.match(/-requested$/);

            // Wildcard on all topics of a channel (such as on the system channel)
            super.emit(route(channel, '*'), envelope);

            if (source) {
                // Wildcard on any source of a channel/topic (ex: 'window/bounds-changed/*')
                super.emit(route(channel, topic, '*'), envelope);

                // Wildcard on any channel/topic of a specified source (ex: 'window/*/myUUID-myWindow')
                super.emit(route(channel, '*', source), envelope);
            }
            if (channel === 'window' || channel === 'application') {
                const checkedPayload = typeof payload === 'object' ? payload : { payload };
                if (channel === 'window') {
                    const propTopic = `window-${topic}`;
                    const dontPropagate = [
                        'close-requested'
                    ];
                    if (!dontPropagate.some(t => t === topic)) {
                        eventPropagations.set(route.application(propTopic, uuid), {
                            ...checkedPayload,
                            type: propTopic,
                            topic: 'application'
                        });
                        if (propagateToSystem) {
                            eventPropagations.set(route.system(propTopic), { ...checkedPayload, type: propTopic, topic: 'system' });
                        }
                    }
                    //Don't propagate -requested events to System
                } else if (propagateToSystem) {
                    const propTopic = `application-${topic}`;
                    const appWindowEventsNotOnWindow = [
                        'window-alert-requested',
                        'window-created',
                        'window-end-load',
                        'window-responding',
                        'window-start-load'
                    ];
                    if (!topic.match(/^window-/)) {
                        eventPropagations.set(route.system(propTopic), { ...checkedPayload, type: propTopic, topic: 'system' });
                    } else if (appWindowEventsNotOnWindow.some(t => t === topic)) {
                        eventPropagations.set(route.system(topic), { ...checkedPayload, type: topic, topic: 'system' });
                    }
                }
            }
        }
        const result = super.emit(routeString, ...data);
        eventPropagations.forEach((propagationPayload, eventString) => {
            this.emit(eventString, propagationPayload, ...extraArgs);
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
