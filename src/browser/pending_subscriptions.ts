/*
Copyright 2017 OpenFin Inc.

Licensed under OpenFin Commercial License you may not use this file except in compliance with your Commercial License.
Please contact OpenFin Inc. at sales@openfin.co to obtain a Commercial License.
*/

import ofEvents from './of_events';
import connectionManager, { PeerRuntime } from './connection_manager';
import { System } from './api/system.js';

let subscriptionIdCount = 0; // id count to generate IDs for subscriptions
const pendingSubscriptions: IPendingSubscription[] = []; // all pending subscriptions are stored here

/**
 * Shape of pending subscriptions
 */
interface IPendingSubscription {
    _id?: number; // ID of the subscription
    uuid: string; // app uuid
    name?: string; // window name
    className: 'application'|'window'; // names of the class event emitters, used for subscriptions
    eventName: string; // name of the type of the event to subscribe to
    listenType: 'on'|'once'; // used to set up subscription type
    fullEventPath: string; // full event name of the subscription (ex: window/connected/uuid-name)
    isCleaned?: boolean; // helps prevents repetitive un-subscriptions
    unSubscriptions?: { // a map of un-subscriptions assigned to runtime versions
        [runtimeVersion: string]: () => void
    };
}

/**
 * Handles addition of a new pending subscription
 */
export function addPendingSubscription(subscription: IPendingSubscription) {
    return new Promise(resolve => {
        subscription._id = getId();
        subscription.unSubscriptions = {};

        connectionManager.resolveIdentity({
            uuid: subscription.uuid

        }).then((id) => {
            // Found app/window in a remote runtime, subscribing
            applyPendingSubscription(id.runtime, subscription);

        }).catch(() => {
            // App/window not found. We are assuming it will come up sometime in the future.
            // For now, add the subscription to the list, and subscribe in all
            // current connected runtimes
            pendingSubscriptions.push(subscription);
            connectionManager.connections.forEach((conn) => {
                applyPendingSubscription(conn, subscription);
            });

        }).then(() => resolve());
    });
}

/**
 * Subscribe to an event in a remote runtime
 */
export function applyPendingSubscription(runtime: PeerRuntime, subscription: IPendingSubscription) {
    const classEventEmitter = getClassEventEmitter(runtime, subscription);
    const runtimeVersion = runtime.portInfo.version;
    const {
        eventName,
        listenType,
        fullEventPath
    } = subscription;

    function listener(data: any) {
        ofEvents.emit(fullEventPath, data);

        // As soon as the event listener fires, we know which runtime is a true
        // subscription 'holder', all other runtimes should remove this subscription
        cleanUpSubscription(subscription, runtime.portInfo.version);
    }

    // Subscribe to an event on a remote runtime
    classEventEmitter[listenType](eventName, listener);

    // Store a cleanup function for the added listener in
    // un-subscription map, so that later we can remove extra subscriptions
    subscription.unSubscriptions[runtimeVersion] = () => {
        classEventEmitter.removeListener(eventName, listener);
    };
}

/**
 * Apply all pending subscriptions for a given runtime
 */
export function applyAllPendingSubscriptions(runtime: PeerRuntime) {
    pendingSubscriptions.forEach(subscription => {
        applyPendingSubscription(runtime, subscription);
    });
}

/**
 * Clean up a pending subscription.
 *
 * Clean up is done when one of the listener fires. This means at that moment
 * we know which runtime is a true subscriptions holder. We then remove the
 * subscription from other runtimes and from the list.
 */
export function cleanUpSubscription(subscription: IPendingSubscription, keepInRuntimeVersion?: string) {
    if (!keepInRuntimeVersion) {
        keepInRuntimeVersion = System.getVersion();
    }

    // Already been cleaned before
    if (subscription.isCleaned) {
        return;
    }

    // Cleanup subscriptions in all connected runtimes
    connectionManager.connections.forEach((conn) => {
        const runtimeVersion = conn.portInfo.version;
        const runtimeUnSubscription = subscription.unSubscriptions[runtimeVersion];

        // Don't un-subscribe in the runtime where we need to keep the subscription
        if (runtimeVersion === keepInRuntimeVersion) {
            return;
        }

        // Invoke un-subscribe function for runtimes that have that subscription
        if (typeof runtimeUnSubscription === 'function') {
            runtimeUnSubscription();
        }
    });

    // Remove subscription from the list of pending subscriptions
    const subscriptionIndex = pendingSubscriptions.findIndex(s => s._id === subscription._id);
    pendingSubscriptions.splice(subscriptionIndex, 1);

    // Indicate the cleaning is done, so that we don't unnecessarily repeat the cleanup
    subscription.isCleaned = true;
}

/**
 * Get event emitter of the class
 */
function getClassEventEmitter(runtime: PeerRuntime, subscription: IPendingSubscription) {
    let classEventEmitter;
    const {
        uuid,
        name,
        className
    } = subscription;

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
