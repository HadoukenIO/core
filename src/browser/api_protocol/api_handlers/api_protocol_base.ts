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
const externalAppplication = require('../external_application.js');
const SubscriptionManager = require('../../subscription_manager.js').SubscriptionManager;
const WebSocketStrategy = require('../transport_strategy/ws_strategy').WebSocketStrategy;
const ElipcStrategy = require('../transport_strategy/elipc_strategy').ElipcStrategy;

import { default as RequestHandler } from '../transport_strategy/base_handler';
import { ActionMap, MessagePackage } from '../transport_strategy/api_transport_base';

import * as log from '../../log';

/* tslint:disable */
let meshEnabled = false;
let connectionManager: any;
/* tslint:enable */

// Uncomment this to enable the mesh (if runtime p2p is available)
// try {
//     connectionManager = require('runtime-p2p').connectionManager;
//     meshEnabled = true;
// } catch (e) {
//     log.writeToLog('info', 'mesh not enabled');
// }

const coreState = require('../../core_state');
const actionMap: ActionMap = {};
const requestHandler = new RequestHandler<MessagePackage>();

if (meshEnabled) {
    requestHandler.addPreProcessor((msg: MessagePackage, next: () => void) => {
        const {identity, data, ack, nack } = msg;
        const payload = data && data.payload;
        const uuid = payload && payload.uuid;
        const isSync = data && data.isSync;  //TODO handle the sync case?
        const islocalWindow = !!coreState.getWindowByUuidName(uuid, uuid);
        const hasIdentityObj = typeof (identity) === 'object';

        // have to check if this is a "local" external connection ...
        if (hasIdentityObj && !isSync && !islocalWindow) {
            try {
                connectionManager.resolveIdentity({uuid})
                    .then((id: any) => {
                        id.runtime.fin.System.executeOnRemote(data, ack, nack);
                    })
                    .catch((e: Error) => {

                        // the target was not local or remote
                        next();
                    });

            } catch (e) {

                // something failed asking for the remote
                log.writeToLog('info', 'error requesting non local window');
                next();
            }
        } else {

            // handle local
            next();
        }
    });
}

// add the handler + create with action map
const webSocketStrategy = new WebSocketStrategy(actionMap, requestHandler);
const elipcStrategy = new ElipcStrategy(actionMap, requestHandler);
const subscriptionManager = new SubscriptionManager();

function registerActionMap(am: ActionMap) {
    Object.getOwnPropertyNames(am).forEach(n => {
        if (actionMap[n] === undefined) {
            actionMap[n] = am[n];
        } else {
            throw new Error(`Key collision ${n} is already registered`);
        }
    });
}

function sendToIdentity(identity: any, payload: any) {
    const externalConnection = externalAppplication.getExternalConnectionByUuid(identity.uuid);

    if (externalConnection) {
        // TODO confirm that this will always be an object on the way in here...
        // webSocketStrategy.send calls JSON.stringify so not needed here
        webSocketStrategy.send(externalConnection, payload);
    } else {
        elipcStrategy.send(identity, payload);
    }
}

function subscriptionExists(identity: any, ...args: any[]) {
    return subscriptionManager.subscriptionExists(identity, ...args);
}

function uppSubscriptionRefCount(identity: any, ...args: any[]) {
    return subscriptionManager.uppSubscriptionRefCount(identity, ...args);
}

function registerSubscription(fn: any, identity: any, ...args: any[]) {
    return subscriptionManager.registerSubscription(fn, identity, ...args);
}

function removeSubscription(identity: any, ...args: any[]) {
    return subscriptionManager.removeSubscription(identity, ...args);
}

function getGroupingWindowIdentity(payload: any) {
    return {
        uuid: payload.groupingUuid,
        name: payload.groupingWindowName
    };
}

function getTargetWindowIdentity(payload: any) {
    return {
        uuid: payload.uuid,
        name: payload.name
    };
}

function getTargetApplicationIdentity(payload: any) {
    return {
        uuid: payload.uuid
    };
}

function onClientAuthenticated(cb: any) {
    webSocketStrategy.onClientAuthenticated(cb);
}

function onClientDisconnect(id: any, cb: any) {
    webSocketStrategy.onClientDisconnect(onDisconnect(id, cb));
}

function onDisconnect(id: any, cb: any) {
    return (connId: any) => {
        if (id === connId) {
            cb(id);
        }
    };
}

function init() {
    webSocketStrategy.registerMessageHandlers();
    elipcStrategy.registerMessageHandlers();
}

module.exports = {
    registerSubscription,
    removeSubscription,
    subscriptionExists,
    uppSubscriptionRefCount,
    getGroupingWindowIdentity,
    getTargetWindowIdentity,
    getTargetApplicationIdentity,
    onClientAuthenticated,
    onClientDisconnect,
    sendToIdentity,
    registerActionMap,
    init
};
