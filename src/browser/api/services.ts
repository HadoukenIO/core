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

import { Identity, Service } from '../../shapes';
import route from '../../common/route';

const servicesMap: Map<string, Service> = new Map();

export module Services {
    export function registerService (identity: Identity, serviceName: string, serviceFunctions: string[] = []) {
        if (servicesMap.get(serviceName)) {
            return false;
        }
        const messageRoot = serviceName;
        // TO DO: MAKE SURE FUNCTION NAMES DONT CLASH?
        const service = { identity, messageRoot, serviceFunctions, serviceName };
        servicesMap.set(serviceName, service);

        return { messageRoot, identity };
    }
    export function getService(serviceName: string) {
        return servicesMap.get(serviceName);
    }
}
