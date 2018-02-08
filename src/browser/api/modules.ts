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

import { Identity, Module } from '../../shapes';
import route from '../../common/route';
import ofEvents from '../of_events';
import { applyPendingModuleConnections } from '../api_protocol/api_handlers/modules_middleware';


const moduleMap: Map<string, Module> = new Map();

export module Modules {
    export function addEventListener(targetIdentity: Identity, type: string, listener: Function) {
        // just uuid or uuid and name?
        const eventString = route.module(type, targetIdentity.uuid);
        const errRegex = /^Attempting to call a function in a renderer frame that has been closed or released/;
        let unsubscribe;
        let browserWinIsDead;

        const safeListener = (...args: any[]) => {
            try {
                listener.call(null, ...args);
            } catch (err) {
                browserWinIsDead = errRegex.test(err.message);

                if (browserWinIsDead) {
                    ofEvents.removeListener(eventString, safeListener);
                }
            }
        };

        ofEvents.on(eventString, safeListener);

        unsubscribe = () => {
            ofEvents.removeListener(eventString, safeListener);
        };
        return unsubscribe;
    }

    export function getModuleByName(moduleName: string) {
        return moduleMap.get(moduleName);
    }

    export function getModuleByUuid(uuid: string): any {
        let moduleIdentity;
        moduleMap.forEach((value, key) => {
            if (value.uuid === uuid) {
                moduleIdentity = moduleMap.get(key);
            }
        });
        return moduleIdentity;
    }

    export function registerModule (identity: Identity, moduleName: string) {
        // If module already registered with that identifier, nack
        if (moduleMap.get(moduleName)) {
            return false;
        }

        const { uuid, name } = identity;
        const moduleIdentity = { uuid, name, moduleName };
        moduleMap.set(moduleName, moduleIdentity);

        // EVENTS CURRENTLY ASSUME THIS IS AN APP - IF EXTERNAL CONNECTION BECOMES OPTION AMEND THIS
        // When module exits, remove from moduleMap - ToDo: Also send to connections? Or let module handle...?
        ofEvents.once(route.application('closed', identity.uuid), () => {
            moduleMap.delete(moduleName);
            ofEvents.emit(route.module('closed', identity.uuid), {
                topic: 'module',
                type: 'closed',
                uuid,
                name
            });
        });

        // execute any requests to connect for module that occured before module launch. Need timeout to ensure registration finished.
        setTimeout(() => {
            applyPendingModuleConnections(moduleName);
        }, 1);

        return { identity };
    }
}
