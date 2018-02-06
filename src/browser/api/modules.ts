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
    export function registerModule (identity: Identity, moduleName: string, moduleFunctions: string[] = []) {
        if (moduleMap.get(moduleName)) {
            return false;
        }
        const moduleIdentity = { identity, moduleName };
        moduleMap.set(moduleName, moduleIdentity);

        // execute any requests to connect for module that occured before module launch.
        applyPendingModuleConnections(moduleName);

        // When module exits, remove from moduleMap - ToDo: Also send to connections? Or let module handle...?
        ofEvents.once(route.application('closed', identity.uuid), () => {
            moduleMap.delete(moduleName);
        });

        return { identity };
    }
    export function getModuleByName(moduleName: string) {
        return moduleMap.get(moduleName);
    }
    export function getModuleByUuid(uuid: string): any {
        let moduleIdentity;
        moduleMap.forEach((value, key) => {
            if (value.identity.uuid === uuid) {
                moduleIdentity = moduleMap.get(key);
            }
        });
        return moduleIdentity;
    }
}
