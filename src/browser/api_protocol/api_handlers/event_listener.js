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
let apiProtocolBase = require('./api_protocol_base.js');
let Window = require('../../api/window.js').Window;
let Application = require('../../api/application.js').Application;
let System = require('../../api/system.js').System;
let ExternalApplication = require('../../api/external_application.js').ExternalConnections;
let _ = require('underscore');

const addNoteListener = require('../../api/notifications/subscriptions').addEventListener;
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
                let windowIdentity = apiProtocolBase.getTargetWindowIdentity(payload);
                return Window.addEventListener(identity, windowIdentity, type, cb);
            }
        },
        'application': {
            name: 'application',
            subscribe: function(identity, type, payload, cb) {
                let appIdentity = apiProtocolBase.getTargetApplicationIdentity(payload);
                return Application.addEventListener(appIdentity, type, cb);
            }
        },
        'system': {
            name: 'system',
            subscribe: function(identity, type, payload, cb) {
                return System.addEventListener(type, cb);
            }
        },
        'notifications': {
            name: 'notifications',
            subscribe: function(identity, type, payload, cb) {
                return addNoteListener(identity, type, payload, cb);
            }
        },
        'externalapplication': {
            name: 'externalapplication',
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
