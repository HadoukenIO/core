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

import { Identity } from '../../shapes';
import SubscriptionManager from '../subscription_manager';
import { EventEmitter } from 'events';
import ofEvents from '../of_events';
import * as log from '../log';
import route from '../../common/route';

//require here because of missing definitions.
const { globalShortcut } = require('electron');

const subscriptionManager = new SubscriptionManager();
const acceleratorOwnershipMap: Map<string, string> = new Map();
const subCount: Map<string, number> = new Map();
const emitter = new EventEmitter();

const eventNames = {
    REGISTERED: 'registered',
    UNREGISTERED: 'unregistered'
};

export const reservedAccelerators: Array<string> = [
    'CommandOrControl+0',
    'CommandOrControl+=',
    'CommandOrControl+Plus',
    'CommandOrControl+-',
    'CommandOrControl+_',
    'CommandOrControl+Shift+I',
    'F5',
    'CommandOrControl+R',
    'Shift+F5',
    'CommandOrControl+Shift+R'
];

export class AcceleratorError extends Error {
    constructor(accelerator: string, reason: string) {
        super(`Failed to register Accelerator: ${accelerator}, ${reason}`);
    }
}

//want to avoid closing over any variables during the register phase.
function constructEmit(accelerator: string): () => void {
    return () => {
        emitter.emit(accelerator);
    };
}

//want to avoid closing over any variables during the register phase.
function constructUnregister(identity: Identity, accelerator: string, listener: Function): () => void {
    return () => {
        emitter.removeListener(accelerator, listener);
        if (emitter.listenerCount(accelerator) < 1) {
            Accelerator.unregister(identity, accelerator);
        }
    };
}

function applyRegistration(identity: Identity, accelerator: string, listener: Function): void {
    emitter.on(accelerator, listener);
    subscriptionManager.registerSubscription(constructUnregister(identity, accelerator, listener), identity, accelerator);
}

//here we will check if the subscription is a valid one.
function checkIfValidRegistration(identity: Identity, accelerator: string): Error | undefined {
    const ownerUuid = acceleratorOwnershipMap.get(accelerator);
    // already allowed this accelerator for this uuid, return early
    if (ownerUuid && ownerUuid === identity.uuid) {
        return;
    } else if (reservedAccelerators.indexOf(accelerator) > -1) {
        return new AcceleratorError(accelerator, 'is reserved');
    } else {
        if (globalShortcut.isRegistered(accelerator)) {
            return new AcceleratorError(accelerator, 'already registered');
        }
    }
}

export module Accelerator {
    export function register(identity: Identity, accelerator: string, listener: Function): void {
        const validationError = checkIfValidRegistration(identity, accelerator);
        if (validationError) {
            throw validationError;
        }
        if (emitter.listenerCount(accelerator) > 0) {
            applyRegistration(identity, accelerator, listener);
        } else if (!globalShortcut.register(accelerator, constructEmit(accelerator))) {
            emitter.removeAllListeners(accelerator);
            throw new AcceleratorError(accelerator, 'register call returned undefined');
        } else {
            acceleratorOwnershipMap.set(accelerator, identity.uuid);
            applyRegistration(identity, accelerator, listener);
            ofEvents.emit(route.accelerator(eventNames.REGISTERED, identity.uuid), {
                identity,
                accelerator
            });
            log.writeToLog('info', `${identity.uuid}-${identity.name} registered global accelerator ${accelerator}`);
        }
    }

    export function unregister(identity: Identity, accelerator: string): void {
        emitter.removeAllListeners(accelerator);
        globalShortcut.unregister(accelerator);
        acceleratorOwnershipMap.delete(accelerator);
        ofEvents.emit(route.accelerator(eventNames.UNREGISTERED, identity.uuid), {
            identity,
            accelerator
        });
        log.writeToLog('info', `${identity.uuid}-${identity.name} unregistered global accelerator ${accelerator}`);
    }

    export function unregisterAll(identity: Identity): void {
        const acceleratorsOwnedById: Array<string> = [];
        acceleratorOwnershipMap.forEach((value, key) => {
            if (value === identity.uuid) {
                acceleratorsOwnedById.push(key);
            }
        });
        acceleratorsOwnedById.map((acc: string) => unregister(identity, acc));
    }

    export function isRegistered(accelerator: string): boolean {
        return globalShortcut.isRegistered(accelerator);
    }

    export function addEventListener(identity: Identity, type: string, listener: Function) {
        const evt = route.accelerator(type, identity.uuid);
        ofEvents.on(evt, listener);

        return () => {
            ofEvents.removeListener(evt, listener);
        };
    }
}
