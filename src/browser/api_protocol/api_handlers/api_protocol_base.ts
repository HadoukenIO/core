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
import { ExternalApplication } from '../../api/external_application';
import SubscriptionManager from '../../subscription_manager';
const WebSocketStrategy = require('../transport_strategy/ws_strategy').WebSocketStrategy;
const ElipcStrategy = require('../transport_strategy/elipc_strategy').ElipcStrategy;

import { default as RequestHandler } from '../transport_strategy/base_handler';
import { MessagePackage } from '../transport_strategy/api_transport_base';
import { ApiPath, ApiFunc, EndpointSpec, ActionSpecMap, Endpoint, ActionMap } from '../shapes';

export const actionMap: ActionMap = Object.create(null); // no prototype to avoid having to call hasOwnProperty()

const requestHandler = new RequestHandler<MessagePackage>();

// add the handler + create with action map
const webSocketStrategy = new WebSocketStrategy(actionMap, requestHandler);
const elipcStrategy = new ElipcStrategy(actionMap, requestHandler);
const subscriptionManager = new SubscriptionManager();

// `actionAPINameMap` has been removed in favor of a complex `actionMap`.
// The API paths previously defined here (as string arrays) have been incorporated into `actionMap`
// as `ApiPath` types (strings in dot notation) in calls to `registerActionMap`.
// To see the full list search (globally) for "apiPath:"

export function registerActionMap(
    specs: ActionSpecMap,
    authorizationPathPrefix?: string // dot notation
) {
    Object.getOwnPropertyNames(specs).forEach((key: string) => {
        if (!actionMap[key]) {
            const spec: EndpointSpec = specs[key];
            let endpoint: Endpoint;

            // resolve `spec` overloads: ApiFunc (function) vs. Endpoint (object containing `apiFunc` function)
            if (typeof spec === 'function') {
                endpoint = { apiFunc: <ApiFunc>spec };
            } else if (typeof spec === 'object') {
                endpoint = <Endpoint>spec;
            } else {
                throw new Error(`Expected action spec to be function or object but found ${typeof spec}`);
            }

            if (typeof endpoint.apiFunc !== 'function') {
                throw new Error(`Expected endpoint.apiFunc to be function but found ${typeof endpoint.apiFunc}`);
            }

            let apiPath: ApiPath = endpoint.apiPath;
            if (apiPath) {
                if (apiPath[0] === '.') {
                    // leading dot appends provided authorization prefix
                    if (!authorizationPathPrefix) {
                        throw new Error('Needed authorization prefix not provided on this call to registerActionMap');
                    }
                    apiPath = authorizationPathPrefix + apiPath;
                } else if (apiPath.indexOf('.') < 0) {
                    throw new Error(`Expected "${apiPath}" to be an apiFunc (starts with dot) or an apiPath (contains dot)`);
                }
                endpoint.apiPath = apiPath;
            }

            actionMap[key] = endpoint;
        } else {
            throw new Error(`Key collision "${key}" is already registered`);
        }
    });
}

export function sendToIdentity(identity: any, payload: any) {
    const externalConnection = ExternalApplication.getExternalConnectionByUuid(identity.uuid);

    if (externalConnection) {
        // TODO confirm that this will always be an object on the way in here...
        // webSocketStrategy.send calls JSON.stringify so not needed here
        webSocketStrategy.send(externalConnection, payload);
    } else {
        elipcStrategy.send(identity, payload);
    }
}

export function subscriptionExists(identity: any, ...args: any[]) {
    return subscriptionManager.subscriptionExists(identity, ...args);
}

export function uppSubscriptionRefCount(identity: any, ...args: any[]) {
    return subscriptionManager.uppSubscriptionRefCount(identity, ...args);
}

export function registerSubscription(fn: any, identity: any, ...args: any[]) {
    return subscriptionManager.registerSubscription(fn, identity, ...args);
}

export function removeSubscription(identity: any, ...args: any[]) {
    return subscriptionManager.removeSubscription(identity, ...args);
}

export function getDefaultRequestHandler(): RequestHandler<MessagePackage> {
    return requestHandler;
}

export function getGroupingWindowIdentity(payload: any) {
    return {
        uuid: payload.groupingUuid,
        name: payload.groupingWindowName
    };
}

export function getTargetWindowIdentity(payload: any) {
    return {
        uuid: payload.uuid,
        name: payload.name
    };
}

export function getTargetApplicationIdentity(payload: any) {
    return {
        uuid: payload.uuid
    };
}

export function onClientAuthenticated(cb: any) {
    webSocketStrategy.onClientAuthenticated(cb);
}

export function onClientDisconnect(id: any, cb: any) {
    webSocketStrategy.onClientDisconnect(onDisconnect(id, cb));
}

function onDisconnect(id: any, cb: any) {
    return (connId: any) => {
        if (id === connId) {
            cb(id);
        }
    };
}

export function init() {
    webSocketStrategy.registerMessageHandlers();
    elipcStrategy.registerMessageHandlers();
}
