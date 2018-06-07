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
const hotkeyOwnershipMap: Map<string, string> = new Map();
const subCount: Map<string, number> = new Map();
const emitter = new EventEmitter();

const eventNames = {
    REGISTERED: 'registered',
    UNREGISTERED: 'unregistered'
};

//index.js will use these on demand
export const reservedHotKeys: Array<string> = [
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

export class HotKeyError extends Error {
    constructor(accelerator: string, reason: string) {
        super(`Failed to register Hotkey: ${accelerator}, ${reason}`);
    }
}

//want to avoid closing over any variables during the register phase.
function constructEmit(hotkey: string): () => void {
    return () => {
        emitter.emit(hotkey);
    };
}

//want to avoid closing over any variables during the register phase.
function constructUnregister(identity: Identity, hotkey: string, listener: Function): () => void {
    return () => {
        emitter.removeListener(hotkey, listener);
        if (emitter.listenerCount(hotkey) < 1) {
            GlobalHotkey.unregister(identity, hotkey);
        }
    };
}

function applyRegistration(identity: Identity, hotkey: string, listener: Function): void {
    emitter.on(hotkey, listener);
    //make sure that if the registered context is destroyed we will unregister the hotkey
    subscriptionManager.registerSubscription(constructUnregister(identity, hotkey, listener), identity, hotkey);
}

//here we will check if the subscription is a valid one.
function validateRegistration(identity: Identity, hotkey: string): Error | undefined {
    const ownerUuid = hotkeyOwnershipMap.get(hotkey);
    // already allowed this hotkey for this uuid, return early
    if (ownerUuid && ownerUuid === identity.uuid) {
        return;
    } else if (reservedHotKeys.indexOf(hotkey) > -1) {
        return new HotKeyError(hotkey, 'is reserved');
    } else {
        if (globalShortcut.isRegistered(hotkey)) {
            return new HotKeyError(hotkey, 'already registered');
        }
    }
}

export module GlobalHotkey {

    export function register(identity: Identity, hotkey: string, listener: Function): void {
        const validationError = validateRegistration(identity, hotkey);
        if (validationError) {
            throw validationError;
        }

        //Multiplex the subscriptions
        if (emitter.listenerCount(hotkey) > 0) {
            applyRegistration(identity, hotkey, listener);
        } else if (!globalShortcut.register(hotkey, constructEmit(hotkey))) {
            emitter.removeAllListeners(hotkey);
            throw new HotKeyError(hotkey, 'register call returned undefined');
        } else {
            hotkeyOwnershipMap.set(hotkey, identity.uuid);
            applyRegistration(identity, hotkey, listener);
            ofEvents.emit(route.globalHotkey(eventNames.REGISTERED, identity.uuid), {
                identity,
                hotkey
            });
            log.writeToLog('info', `${identity.uuid}-${identity.name} registered global hotkey ${hotkey}`);
        }
    }

    export function unregister(identity: Identity, hotkey: string): void {
        emitter.removeAllListeners(hotkey);
        globalShortcut.unregister(hotkey);
        hotkeyOwnershipMap.delete(hotkey);
        ofEvents.emit(route.globalHotkey(eventNames.UNREGISTERED, identity.uuid), {
            identity,
            hotkey
        });
        log.writeToLog('info', `${identity.uuid}-${identity.name} unregistered global hotkey ${hotkey}`);
    }

    export function unregisterAll(identity: Identity): void {
        const hotkeyOwnedById: Array<string> = [];
        hotkeyOwnershipMap.forEach((value, key) => {
            if (value === identity.uuid) {
                hotkeyOwnedById.push(key);
            }
        });
        hotkeyOwnedById.forEach((acc: string) => unregister(identity, acc));
    }

    export function isRegistered(hotkey: string): boolean {
        return globalShortcut.isRegistered(hotkey);
    }

    export function addEventListener(identity: Identity, type: string, listener: Function) {
        const evt = route.globalHotkey(type, identity.uuid);
        ofEvents.on(evt, listener);

        return () => {
            ofEvents.removeListener(evt, listener);
        };
    }
}
