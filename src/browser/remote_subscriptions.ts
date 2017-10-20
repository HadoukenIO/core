/*
Copyright 2017 OpenFin Inc.

Licensed under OpenFin Commercial License you may not use this file except in compliance with your Commercial License.
Please contact OpenFin Inc. at sales@openfin.co to obtain a Commercial License.
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
    unSubscriptions: Map<string, (() => void)[]>; // a map of un-subscriptions assigned to runtime versions
}

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
        const clonedProps = Object.create(subscriptionProps);
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

export function subscribeToAllRuntimes(subscriptionProps: RemoteSubscriptionProps|RemoteSubscription): Promise<() => void> {
    return new Promise(resolve => {
        // If there aren't any external runtimes, return undefined
        if (!connectionManager.connections.length) {
            return;
        }

        const clonedProps = Object.create(subscriptionProps);
        const subscription: RemoteSubscription = Object.assign(clonedProps, {isCleaned: false});
        const { className, eventName, listenType, unSubscriptions } = subscription;
        const fullEventName = route(className, eventName);

        // Only generate an ID for new subscriptions
        if (!subscription._id) {
            subscription._id = getId();
        }

        // Create a new un-subscription map only for new subscriptions
        if (typeof subscription.unSubscriptions !== 'object') {
            subscription.unSubscriptions = new Map();
        }

        // PENDING REMOTE SUBSCRIPTIONS? FOR FUTURE RUNTIMES?
        // Looks like we don't technically need the remote subscriptions to finish before resolving the unsubscribe...
        Promise.all(connectionManager.connections.map(runtime => {
            const runtimeKey = keyFromPortInfo(runtime.portInfo);
            pendingRemoteSubscriptions.set(subscription._id, subscription);

            const listener = (data: any) => {
                if (!data.runtimeUuid) {
                    data.runtimeUuid = getMeshUuid();
                    ofEvents.emit(fullEventName, data);
                }
            };
            // Subscribe to an event on a remote runtime
            return runtime.fin.System[listenType](eventName, listener)
            .then(() => {
                // Store a cleanup function for the added listener in
                // un-subscription map, so that later we can remove extra subscriptions
                if (!Array.isArray(unSubscriptions.get(runtimeKey))) {
                    unSubscriptions.set(runtimeKey, []);
                }
                unSubscriptions.get(runtimeKey).push(() => {
                    runtime.fin.System.removeListener(eventName, listener);
                });
                // IS THIS RETURN NECESSARY?
                return;
            });
        }))
        .then(() => {
            // Resolving with a subscription cleanup function
            const unsubscribe = cleanUpSubscription.bind(null, subscription);
            resolve(unsubscribe);
        });
    });
}

/**
 * Apply all pending remote subscriptions for a given runtime
 */
export function applyAllRemoteSubscriptions(runtime: PeerRuntime) {
    pendingRemoteSubscriptions.forEach(subscription => {
        applyRemoteSubscription(subscription, runtime);
    });
}

/**
 * Subscribe to an event in a remote runtime
 */
function applyRemoteSubscription(subscription: RemoteSubscription, runtime: PeerRuntime) {
    const classEventEmitter = getClassEventEmitter(subscription, runtime);
    const runtimeKey = keyFromPortInfo(runtime.portInfo);
    const { uuid, name, className, eventName, listenType, unSubscriptions } = subscription;
    const fullEventName = (typeof name === 'string')
        ? route(className, eventName, uuid, name, true)
        : route(className, eventName, uuid);

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
 * Get event emitter of the class
 */
function getClassEventEmitter(subscription: RemoteSubscription, runtime: PeerRuntime) {
    let classEventEmitter;
    const { uuid, name, className } = subscription;

    switch (className) {
        case 'application':
            classEventEmitter = runtime.fin.Application.wrap({uuid});
            break;
        case 'window':
            classEventEmitter = runtime.fin.Window.wrap({uuid, name});
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
