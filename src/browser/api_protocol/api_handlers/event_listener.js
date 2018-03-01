/*
Copyright 2017 OpenFin Inc.

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

// built-in modules
// (none)

// npm modules
let _ = require('underscore');

// local modules
let apiProtocolBase = require('./api_protocol_base.js');
let Window = require('../../api/window.js').Window;
let Application = require('../../api/application.js').Application;
let System = require('../../api/system.js').System;
import { ExternalApplication } from '../../api/external_application';
import { Frame } from '../../api/frame';
import { Service } from '../../api/service';

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
        'service': {
            name: 'service',
            subscribe: function(identity, type, payload, cb) {
                const { uuid } = payload;
                const serviceIdentity = apiProtocolBase.getTargetApplicationIdentity(payload);
                const targetUuid = serviceIdentity.uuid;
                const islocalApp = !!coreState.getWindowByUuidName(targetUuid, targetUuid);
                const localUnsub = Service.addEventListener(serviceIdentity, type, cb);
                let remoteUnSub;
                const isExternalClient = ExternalApplication.isRuntimeClient(identity.uuid);

                if (!islocalApp && !isExternalClient) {
                    const subscription = {
                        uuid,
                        listenType: 'on',
                        className: 'service',
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
                subscribeToAllRuntimes(subscription).then(unSubscribe => {
                    remoteUnSub = unSubscribe;
                });

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
        }
    };

    function subToDesktopEvent(identity, message, ack) {
        let topic = message.payload.topic;
        let uuid = message.payload.uuid;
        let type = message.payload.type;
        let name = message.payload.name;
        let subTopicProvider = subscriptionProvider[topic];
        let unsubscribe;

        if (apiProtocolBase.subscriptionExists(identity, topic, uuid, type, name)) {
            apiProtocolBase.uppSubscriptionRefCount(identity, topic, uuid, type, name);

        } else if (subTopicProvider && typeof(subTopicProvider.subscribe) === 'function') {

            unsubscribe = subTopicProvider.subscribe(identity, type, message.payload, (emmitedPayload) => {
                let eventObj = {
                    action: 'process-desktop-event',
                    payload: {
                        topic: topic,
                        type: type,
                        uuid: uuid
                    }
                };
                if (name) {
                    eventObj.payload.name = name; // name may exist in emmitedPayload
                }
                if (!uuid && emmitedPayload.uuid) {
                    eventObj.payload.uuid = emmitedPayload.uuid;
                }
                if (typeof(emmitedPayload) === 'object') {
                    _.extend(eventObj.payload, _.omit(emmitedPayload, _.keys(eventObj.payload)));
                }

                apiProtocolBase.sendToIdentity(identity, eventObj);
            });

            apiProtocolBase.registerSubscription(unsubscribe, identity, topic, uuid, type, name);
        }
        ack(successAck);
    }

    function unSubToDesktopEvent(identity, message, ack) {
        let topic = message.payload.topic;
        let uuid = message.payload.uuid;
        let type = message.payload.type;
        let name = message.payload.name;

        apiProtocolBase.removeSubscription(identity, topic, uuid, type, name);
        ack(successAck);
    }
}


module.exports.EventListenerApiHandler = EventListenerApiHandler;
