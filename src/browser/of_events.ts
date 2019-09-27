import { app } from 'electron';
import { EventEmitter } from 'events';
import { isFloat } from '../common/main';
import route from '../common/route';

interface PastEvent {
    payload: any;
    routeString: string;
    timestampJs: number;
    timestampNative: number;
}

class OFEvents extends EventEmitter {
    private history: PastEvent[]; // for temporarily storing past events
    private isSavingEvents: boolean; // for temporarily storing past events

    constructor() {
        super();
        this.startTempSaveEvents();
    }

    public emit(routeString: string, ...data: any[]) {
        const tokenizedRoute = routeString.split('/');
        const eventPropagations = new Map<string, any>();
        const [payload, maybeOpts, ...otherExtraArgs] = data;
        if (this.isSavingEvents) {
            const timestampJs = Date.now();
            const timestampNative = app.nowFromSystemTime();
            this.history.push({ payload, routeString, timestampJs, timestampNative });
        }
        const isMultiRuntimeEvent = maybeOpts && maybeOpts.isMultiRuntime;
        const extraArgs = isMultiRuntimeEvent ? otherExtraArgs : [maybeOpts, ...otherExtraArgs];
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
            const shouldPropagate = (channel === 'window' || channel === 'view' || channel === 'application') && !isMultiRuntimeEvent;
            if (shouldPropagate) {
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
                } else if (channel === 'view') {
                    const propTopic = `view-${topic}`;
                    eventPropagations.set(route.application(propTopic, uuid), {
                        ...checkedPayload,
                        type: propTopic,
                        topic: 'application'
                    });
                    if (propagateToSystem) {
                        eventPropagations.set(route.system(propTopic), { ...checkedPayload, type: propTopic, topic: 'system' });
                    }
                    //Don't propagate -requested events to System
                } else if (channel === 'application' && propagateToSystem) {
                    const propTopic = `application-${topic}`;
                    const appWindowEventsNotOnWindow = [
                        'window-alert-requested',
                        'window-created',
                        'window-end-load',
                        'window-responding',
                        'window-start-load'
                    ];
                    if (!topic.match(/^window-/) && !topic.match(/^view-/)) {
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

    /*
        Check missed events for subscriptions received
        after the event has already fired
    */
    public checkMissedEvents(data: any, listener: (payload: any) => void): void {
        const { name, timestamp, topic, type, uuid } = data;
        const routeString = route[topic](type, uuid, name);

        this.history.forEach((pastEvent) => {
            const routeMatches = pastEvent.routeString === routeString;

            if (routeMatches) {
                let missedEvent = false;

                if (Number.isInteger(timestamp)) {
                    missedEvent = pastEvent.timestampJs >= timestamp;
                } else if (isFloat(timestamp)) {
                    missedEvent = pastEvent.timestampNative >= timestamp;
                }

                if (missedEvent) {
                    listener(pastEvent.payload);
                }
            }
        });
    }

    /*
        Temporary indicator for saving past events
    */
    private startTempSaveEvents() {
        const STARTUP_SAVE_EVENTS_DURATION = 10000;

        this.history = [];
        this.isSavingEvents = true;

        setTimeout(() => {
            this.history.length = 0;
            this.isSavingEvents = false;
        }, STARTUP_SAVE_EVENTS_DURATION);
    }
}

interface StringMap {
    [key: string]: string;
}

export default new OFEvents();
