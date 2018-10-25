// built-in modules
// (none)

// npm modules
let _ = require('underscore');

// local modules
let apiProtocolBase = require('./api_protocol_base.js');
import { Window } from '../../api/window';
let Application = require('../../api/application.js').Application;
let System = require('../../api/system.js').System;
import { ExternalApplication } from '../../api/external_application';
import { Frame } from '../../api/frame';
import { Channel } from '../../api/channel';
import { GlobalHotkey } from '../../api/global_hotkey';
const ofEvents = require('../../of_events').default;

const coreState = require('../../core_state');
const addNoteListener = require('../../api/notifications/subscriptions').addEventListener;

import {
    addRemoteSubscription,
    subscribeToAllRuntimes
} from '../../remote_subscriptions';

// locals
const successAck = {
    success: true
};

function EventListenerApiHandler() {
    const eventListenerActionMap = {
        'subscribe-to-desktop-event': subToDesktopEvent,
        'unsubscribe-to-desktop-event': unSubToDesktopEvent
    };

    apiProtocolBase.registerActionMap(eventListenerActionMap);

    const subscriptionProvider = {
        'window': {
            name: 'window',
            subscribe: function(identity, type, payload, cb) {
                const {
                    uuid,
                    name
                } = payload;
                const windowIdentity = apiProtocolBase.getTargetWindowIdentity(payload);
                const targetUuid = windowIdentity.uuid;
                const islocalWindow = !!coreState.getWindowByUuidName(targetUuid, targetUuid);
                const localUnsub = Window.addEventListener(identity, windowIdentity, type, cb);
                let remoteUnSub;
                const isExternalClient = ExternalApplication.isRuntimeClient(identity.uuid);

                if (!islocalWindow && !isExternalClient) {
                    const subscription = {
                        uuid,
                        name,
                        listenType: 'on',
                        className: 'window',
                        eventName: type
                    };

                    addRemoteSubscription(subscription).then(unSubscribe => {
                        remoteUnSub = unSubscribe;
                    });
                }

                return () => {
                    localUnsub();
                    if (typeof remoteUnSub === 'function') {
                        remoteUnSub();
                    }
                };
            }
        },
        'frame': {
            name: 'frame',
            subscribe: function(identity, type, payload, cb) {
                const {
                    uuid,
                    name
                } = payload;
                const frameIdentity = apiProtocolBase.getTargetWindowIdentity(payload);
                const targetUuid = frameIdentity.uuid;
                const islocalWindow = !!coreState.getWindowByUuidName(targetUuid, targetUuid);
                const localUnsub = Frame.addEventListener(frameIdentity, type, cb);
                let remoteUnSub;
                const isExternalClient = ExternalApplication.isRuntimeClient(identity.uuid);

                if (!islocalWindow && !isExternalClient) {
                    const subscription = {
                        uuid,
                        name,
                        listenType: 'on',
                        className: 'frame',
                        eventName: type
                    };

                    addRemoteSubscription(subscription).then(unSubscribe => {
                        remoteUnSub = unSubscribe;
                    });
                }

                return () => {
                    localUnsub();
                    if (typeof remoteUnSub === 'function') {
                        remoteUnSub();
                    }
                };
            }
        },
        'application': {
            name: 'application',
            subscribe: function(identity, type, payload, cb) {
                const {
                    uuid
                } = payload;
                const appIdentity = apiProtocolBase.getTargetApplicationIdentity(payload);
                const targetUuid = appIdentity.uuid;
                const islocalApp = !!coreState.getWindowByUuidName(targetUuid, targetUuid);
                const localUnsub = Application.addEventListener(appIdentity, type, cb);
                let remoteUnSub;
                const isExternalClient = ExternalApplication.isRuntimeClient(identity.uuid);

                if (!islocalApp && !isExternalClient) {
                    const subscription = {
                        uuid,
                        listenType: 'on',
                        className: 'application',
                        eventName: type
                    };

                    addRemoteSubscription(subscription).then(unSubscribe => {
                        remoteUnSub = unSubscribe;
                    });
                }

                return () => {
                    localUnsub();
                    if (typeof remoteUnSub === 'function') {
                        remoteUnSub();
                    }
                };
            }
        },
        'channel': {
            name: 'channel',
            subscribe: function(identity, type, payload, cb) {
                const targetIdentity = apiProtocolBase.getTargetWindowIdentity(payload);
                const { uuid } = targetIdentity;
                const islocalUuid = coreState.isLocalUuid(uuid);
                const localUnsub = Channel.addEventListener(targetIdentity, type, cb);
                let remoteUnSub;
                const isExternalClient = ExternalApplication.isRuntimeClient(identity.uuid);

                if (!islocalUuid && !isExternalClient && (type === 'connected' || type === 'disconnected')) {
                    const subscription = {
                        listenType: 'on',
                        className: 'channel',
                        eventName: type
                    };
                    subscribeToAllRuntimes(subscription).then(unSubscribe => {
                        remoteUnSub = unSubscribe;
                    });
                }

                return () => {
                    localUnsub();
                    if (typeof remoteUnSub === 'function') {
                        remoteUnSub();
                    }
                };
            }
        },
        'system': {
            name: 'system',
            subscribe: function(identity, type, payload, cb) {
                const localUnsub = System.addEventListener(type, cb);
                const subscription = {
                    listenType: 'on',
                    className: 'system',
                    eventName: type
                };

                let remoteUnSub;
                const isExternalClient = ExternalApplication.isRuntimeClient(identity.uuid);
                if (!isExternalClient) {
                    subscribeToAllRuntimes(subscription).then(unSubscribe => {
                        remoteUnSub = unSubscribe;
                    });
                }

                return () => {
                    localUnsub();
                    if (typeof remoteUnSub === 'function') {
                        remoteUnSub();
                    }
                };
            }
        },
        'notifications': {
            name: 'notifications',
            subscribe: function(identity, type, payload, cb) {
                return addNoteListener(identity, type, payload, cb);
            }
        },
        'external-application': {
            name: 'external-application',
            subscribe: function(identity, type, payload, cb) {
                let externalAppIdentity = {
                    uuid: payload.uuid
                };
                return ExternalApplication.addEventListener(externalAppIdentity, type, cb);
            }
        },
        'global-hotkey': {
            name: 'global-hotkey',
            subscribe: function(identity, type, payload, cb) {
                return GlobalHotkey.addEventListener(identity, type, cb);
            }
        }
    };

    function subToDesktopEvent(identity, message, ack) {
        const { payload } = message;
        const { name, topic, type, uuid } = payload;
        const subTopicProvider = subscriptionProvider[topic];

        const listener = (emittedPayload) => {
            const event = {
                action: 'process-desktop-event',
                payload: { topic, type, uuid }
            };

            if (name) {
                event.payload.name = name; // name may exist in emittedPayload
            }

            if (!uuid && emittedPayload.uuid) {
                event.payload.uuid = emittedPayload.uuid;
            }

            if (typeof emittedPayload === 'object') {
                _.extend(event.payload, _.omit(emittedPayload, _.keys(event.payload)));
            }

            apiProtocolBase.sendToIdentity(identity, event);
        };

        if (apiProtocolBase.subscriptionExists(identity, topic, uuid, type, name)) {
            apiProtocolBase.uppSubscriptionRefCount(identity, topic, uuid, type, name);
        } else if (subTopicProvider && typeof subTopicProvider.subscribe === 'function') {
            const unsubscribe = subTopicProvider.subscribe(identity, type, payload, listener);
            apiProtocolBase.registerSubscription(unsubscribe, identity, topic, uuid, type, name);
        }

        ack(successAck);

        ofEvents.checkMissedEvents(payload, listener);
    }

    function unSubToDesktopEvent(identity, message, ack) {
        const { payload } = message;
        const { name, topic, type, uuid } = payload;

        apiProtocolBase.removeSubscription(identity, topic, uuid, type, name);
        ack(successAck);
    }
}
module.exports.EventListenerApiHandler = EventListenerApiHandler;
