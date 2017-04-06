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
let ExternalApplication = require('../../api/external_application.js').ExternalConnections;
import {
    default as connectionManager
} from '../../connection_manager';
const coreState = require('../../core_state');
import * as log from '../../log';
import {
    default as ofEvents
} from '../../of_events';
const addNoteListener = require('../../api/notifications/subscriptions').addEventListener;


// locals
const successAck = {
    success: true
};


function addRemoteWindowListener(fin, targetWindowIdentity, type) {
    const topic = 'window';
    const {
        uuid,
        name
    } = targetWindowIdentity;
    const remoteWin = fin.Window.wrap(targetWindowIdentity);
    const handler = (remoteResponse) => {
        ofEvents.emit(`${topic}/${type}/${uuid}-${name}`, remoteResponse);
    };

    remoteWin.on(type, handler);

    return remoteWin.removeListener.bind(remoteWin, type, handler);
}


function addRemoteApplicationListener(fin, targetAppIdentity, type) {
    const topic = 'application';
    const {
        uuid
    } = targetAppIdentity;
    const remoteApp = fin.Application.wrap(targetAppIdentity);
    const handler = (remoteResponse) => {
        ofEvents.emit(`${topic}/${type}/${uuid}`, remoteResponse);
    };

    remoteApp.on(type, handler);

    return remoteApp.removeListener.bind(remoteApp, type, handler);
}


function isBrowserClient(uuid) {
    return connectionManager.connections.map((conn) => {
        return conn.portInfo.version + ':' + conn.portInfo.port;
    }).filter((id) => id === uuid).length > 0;
}

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
                const windowIdentity = apiProtocolBase.getTargetWindowIdentity(payload);
                const targetUuid = windowIdentity.uuid;
                const islocalWindow = !!coreState.getWindowByUuidName(targetUuid, targetUuid);
                const localUnsub = Window.addEventListener(identity, windowIdentity, type, cb);
                const remoteUnsubs = [];
                const isExternalClient = isBrowserClient(identity.uuid);

                if (!islocalWindow && !isExternalClient) {
                    try {
                        connectionManager.resolveIdentity({
                                uuid: targetUuid
                            })
                            .then((id) => {
                                const unsub = addRemoteWindowListener(id.runtime.fin, windowIdentity, type);
                                remoteUnsubs.push(unsub);
                            })
                            .catch(() => {
                                connectionManager.connections.forEach((conn) => {
                                    const unsub = addRemoteWindowListener(conn.fin, windowIdentity, type);
                                    remoteUnsubs.push(unsub);
                                });
                            });
                    } catch (e) {

                        // something failed asking for the remote
                        log.writeToLog('info', e.message);
                    }
                }

                return () => {
                    localUnsub();
                    remoteUnsubs.forEach(unsub => unsub());
                };
            }
        },
        'application': {
            name: 'application',
            subscribe: function(identity, type, payload, cb) {
                const appIdentity = apiProtocolBase.getTargetApplicationIdentity(payload);
                const targetUuid = appIdentity.uuid;
                const islocalApp = !!coreState.getWindowByUuidName(targetUuid, targetUuid);
                const localUnsub = Application.addEventListener(appIdentity, type, cb);
                const remoteUnsubs = [];
                const isExternalClient = isBrowserClient(identity.uuid);

                if (!islocalApp && !isExternalClient) {
                    try {
                        connectionManager.resolveIdentity({
                                uuid: targetUuid
                            })
                            .then((id) => {
                                const unsub = addRemoteApplicationListener(id.runtime.fin, appIdentity, type);
                                remoteUnsubs.push(unsub);
                            })
                            .catch(() => {
                                connectionManager.connections.forEach((conn) => {
                                    const unsub = addRemoteApplicationListener(conn.fin, appIdentity, type);
                                    remoteUnsubs.push(unsub);
                                });
                            });
                    } catch (e) {

                        // something failed asking for the remote
                        log.writeToLog('info', 'error requesting non local application' + e.message);
                    }
                }

                return () => {
                    localUnsub();
                    remoteUnsubs.forEach(unsub => unsub());
                };
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
