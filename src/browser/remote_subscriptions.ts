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

/**
 * DESCRIPTION
 *
 * This module handles remote subscriptions (multi-runtime).
 *
 * When adding a remote subscription, it will first check if the identity you are subscribing to exists in
 * another runtime that is already connected.
 *
 * If the identity is not found, it will store the subscription locally in the list of pending subscription
 * and will also apply the subscription to all the runtimes that are already connected.
 *
 * Once the listener is fired from one of the connected runtimes, it will clean the subscription from other
 * connected runtimes and will remove the subscription from the list of pending subscriptions. In addition
 * to doing the cleanup, it will persist the subscription to handle the case where the runtime exits and
 * then may come back up again in the future.
 */

import ofEvents from './of_events';
import connectionManager, { PeerRuntime, keyFromPortInfo, getMeshUuid } from './connection_manager';
import { Identity } from '../shapes';
import route from '../common/route';
import * as coreState from './core_state';
import { PortInfo } from './port_discovery';
import { EventEmitter } from 'events';

// id count to generate IDs for subscriptions
let subscriptionIdCount = 0;
// all pending remote subscriptions are stored here
const pendingRemoteSubscriptions: Map<number, RemoteSubscription> = new Map();

/**
 * Shape of remote subscription props
 */
interface RemoteSubscriptionProps extends Identity {
    className: 'application'|'window'|'system'; // names of the class event emitters, used for subscriptions
    eventName: string; // name of the type of the event to subscribe to
    listenType: 'on'|'once'; // used to set up subscription type
}

/**
 * Shape of a remote subscription
 */
interface RemoteSubscription extends RemoteSubscriptionProps {
    _id: number; // ID of the subscription
    isCleaned: boolean; // helps prevents repetitive un-subscriptions and other cleanup
    isSystemEvent?: boolean; // helps point applyAllRemoteSubscriptions to the correct function
    unSubscriptions: Map<string, (() => void)[]>; // a map of un-subscriptions assigned to runtime versions
}

const systemEventsToIgnore: {[index: string]: boolean} = {
    'idle-state-changed': true,
    'monitor-info-changed': true,
    'session-changed': true
};

/**
 * Handles addition of a remote subscription.
 *
 * The subscription can be completely new, or, it can be a re-addition of a previous subscription
 * that is being persisted and being re-added, because the runtime where it was attached to has exited.
 * After the runtime that was a true subscription holder exits, we don't know which runtime will have
 * the needed identity in the future, and so we need to treat this subscription the same way as new.
 */
export function addRemoteSubscription(subscriptionProps: RemoteSubscriptionProps|RemoteSubscription): Promise<() => void> {
    return new Promise(resolve => {
        const clonedProps = JSON.parse(JSON.stringify(subscriptionProps));
        const subscription: RemoteSubscription = Object.assign(clonedProps, {isCleaned: false});

        // Only generate an ID for new subscriptions
        if (!subscription._id) {
            subscription._id = getId();
        }

        // Create a new un-subscription map only for new subscriptions
        if (typeof subscription.unSubscriptions !== 'object') {
            subscription.unSubscriptions = new Map();
        }

        connectionManager.resolveIdentity({
            uuid: subscription.uuid

        }).then((id) => {
            // Found app/window in a remote runtime, subscribing
            applyRemoteSubscription(subscription, id.runtime);

        }).catch(() => {
            // App/window not found. We are assuming it will come up sometime in the future.
            // For now, subscribe in all current connected runtimes and add the subscription
            // to the pending list for future runtimes
            pendingRemoteSubscriptions.set(subscription._id, subscription);
            connectionManager.connections.forEach((runtime) => {
                applyRemoteSubscription(subscription, runtime);
            });

        }).then(() => {
            // Resolving with a subscription cleanup function
            const unsubscribe = cleanUpSubscription.bind(null, subscription);
            resolve(unsubscribe);
        });
    });
}

/**
 * Subscribe to an event in a remote runtime
 */
async function applyRemoteSubscription(subscription: RemoteSubscription, runtime: PeerRuntime) {
    const classEventEmitter = await getClassEventEmitter(subscription, runtime);
    const runtimeKey = keyFromPortInfo(runtime.portInfo);
    const { uuid, name, className, eventName, listenType } = subscription;
    let { unSubscriptions } = subscription;
    const fullEventName = (typeof name === 'string')
        ? route(className, eventName, uuid, name, true)
        : route(className, eventName, uuid);

    //Handling the case where the identity has been found in a new runtime via applyAllSubscriptions
    if (!(unSubscriptions instanceof Map)) {
        unSubscriptions = new Map();
        subscription.unSubscriptions = unSubscriptions;
    }
    const listener = (data: any) => {
        if (!data.runtimeUuid) {
            data.runtimeUuid = getMeshUuid();
            ofEvents.emit(fullEventName, data);
        }

        // As soon as the event listener fires, we know which runtime is a true
        // subscription holder, all other runtimes should remove this subscription
        cleanUpSubscription(subscription, runtimeKey);
    };


    // Subscribe to an event on a remote runtime
    classEventEmitter[listenType](eventName, listener);


    // Store a cleanup function for the added listener in
    // un-subscription map, so that later we can remove extra subscriptions
    if (!Array.isArray(unSubscriptions.get(runtimeKey))) {
        unSubscriptions.set(runtimeKey, []);
    }
    unSubscriptions.get(runtimeKey).push(() => {
        classEventEmitter.removeListener(eventName, listener);
    });
}

/**
 * Clean up a pending subscription.
 *
 * Clean up is done when one of the listener fires. This means at that moment
 * we know which runtime is a true subscriptions holder. We then remove the
 * subscription from other runtimes and from the pending list.
 */
function cleanUpSubscription(subscription: RemoteSubscription, keepInRuntimeVersion?: string) {

    // Already been cleaned before in unneeded runtime versions
    if (subscription.isCleaned && keepInRuntimeVersion) {
        return;
    }
    // Cleanup subscriptions in all connected runtimes
    connectionManager.connections.forEach((runtime) => {
        const runtimeKey = keyFromPortInfo(runtime.portInfo);

        // Don't un-subscribe in the runtime where we need to keep the subscription
        if (runtimeKey === keepInRuntimeVersion) {
            persistSubscription(subscription, runtime);
            return;
        }

        // Unsubscribe in unneeded runtimes
        unSubscribe(subscription, runtime);
    });

    // Remove subscription from the map of pending subscriptions
    pendingRemoteSubscriptions.delete(subscription._id);

    // Indicate the cleaning is done, so that we don't unnecessarily repeat the actions above
    subscription.isCleaned = true;
}

/**
 * Persisting a subscription means that when the runtime exits, we will put the subscription
 * back into the list of pending remote subscriptions, so that when that runtime possibly
 * comes back in the future, we can subscribe again
 */
function persistSubscription(subscription: RemoteSubscription, runtime: PeerRuntime) {
    const runtimeKey = keyFromPortInfo(runtime.portInfo);
    const { unSubscriptions } = subscription;
    const disconnectEventName = 'disconnected';

    const listener = () => {
        unSubscribe(subscription, runtime);
        addRemoteSubscription(subscription);
    };

    runtime.fin.on(disconnectEventName, listener);
    unSubscriptions.get(runtimeKey).push(() => {
        runtime.fin.removeListener(disconnectEventName, listener);
    });
}

/**
 * Remove subscription from a given runtime
 */
function unSubscribe(subscription: RemoteSubscription, runtime: PeerRuntime) {
    const runtimeKey = keyFromPortInfo(runtime.portInfo);
    const { unSubscriptions } = subscription;
    const unSubs = unSubscriptions.get(runtimeKey);

    if (unSubs) {
        unSubs.forEach(unSubscribe => unSubscribe());
    }
    unSubscriptions.delete(runtimeKey);
}

/**
 * Apply all pending remote subscriptions for a given runtime
 */
export function applyAllRemoteSubscriptions(runtime: PeerRuntime) {
    pendingRemoteSubscriptions.forEach(subscription => {
        if (!subscription.isSystemEvent) {
            applyRemoteSubscription(subscription, runtime);
        } else {
            applySystemSubscription(subscription, runtime);
        }
    });
}

/**
 * Handles addition of a system subscription on remote runtimes.
 */
export function subscribeToAllRuntimes(subscriptionProps: RemoteSubscriptionProps|RemoteSubscription): Promise<() => void> {
    return new Promise(resolve => {
        if (systemEventsToIgnore[subscriptionProps.eventName]) {
            resolve();
        }

        const clonedProps = JSON.parse(JSON.stringify(subscriptionProps));
        const subscription: RemoteSubscription = Object.assign(clonedProps, {isSystemEvent: true});

        // Generate a subscription ID for pending subscriptions
        subscription._id = getId();

        // Create an un-subscription map
        subscription.unSubscriptions = new Map();

        // Subscribe in all connected runtimes
        if (connectionManager.connections.length) {
            connectionManager.connections.forEach(runtime => applySystemSubscription(subscription, runtime));
        }

        // Add the subscription to pending to cover any runtimes launched in the future
        pendingRemoteSubscriptions.set(subscription._id, subscription);

        // Resolving with a subscription cleanup function
        const unsubscribe = systemUnsubscribe.bind(null, subscription);
        resolve(unsubscribe);
    });
}

/**
 * Remove a system subscription from all runtimes
 */
function systemUnsubscribe(subscription: any) {
    subscription.unSubscriptions.forEach((runtime: any[]) => {
        if (runtime.length) {
            runtime.forEach((removeListener: any) => removeListener());
        }
    });
    pendingRemoteSubscriptions.delete(subscription._id);
}

/**
 * Subscribe to a system event in a remote runtime
 */
function applySystemSubscription(subscription: RemoteSubscription, runtime: PeerRuntime) {
    const { className, eventName, listenType } = subscription;
    const fullEventName = route(className, eventName);
    const runtimeKey = keyFromPortInfo(runtime.portInfo);

    const listener = (data: any) => {
        if (!data.runtimeUuid) {
            data.runtimeUuid = getMeshUuid();
            ofEvents.emit(fullEventName, data);
        }
    };
    // Subscribe to an event on a remote runtime
    runtime.fin.System[listenType](eventName, listener);


    // When runtime disconnects, remove the subscription for that runtime
    // It will be re-added from pending subscriptions if the runtime connects again
    const disconnectEventName = 'disconnected';
    const unSubscribeListener = () => {
        unSubscribe(subscription, runtime);
    };
    runtime.fin.on(disconnectEventName, unSubscribeListener);

    // Store a cleanup function for the added listener and disconnect listener in
    // un-subscription map, so that we can remove all subscriptions
    if (!Array.isArray(subscription.unSubscriptions.get(runtimeKey))) {
        subscription.unSubscriptions.set(runtimeKey, []);
    }

    subscription.unSubscriptions.get(runtimeKey).push(() => {
        runtime.fin.System.removeListener(eventName, listener);
        runtime.fin.removeListener(disconnectEventName, unSubscribeListener);
    });
}

/**
 * Get event emitter of the class
 */
async function getClassEventEmitter(subscription: RemoteSubscription, runtime: PeerRuntime): Promise<EventEmitter> {
    let classEventEmitter;
    const { uuid, name, className } = subscription;

    switch (className) {
        case 'application':
            classEventEmitter = await runtime.fin.Application.wrap({uuid});
            break;
        case 'window':
            classEventEmitter = await runtime.fin.Window.wrap({uuid, name});
            break;
    }

    return classEventEmitter;
}

/**
 * Generates an unique ID for a subscription
 */
function getId() {
    return ++subscriptionIdCount;
}
