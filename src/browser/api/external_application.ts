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

import ofEvents from '../of_events';
import { Identity } from '../../shapes';
import * as ProcessTracker from '../process_tracker.js';
import route from '../../common/route';

const authenticatedConnections: ExternalApplicationOptions[] = [];

export interface ExternalApplicationClient {
    type: 'dotnet' | 'java' | 'air' | 'node' | 'silverlight';
    version: string;
}

export interface ExternalApplicationOptions extends Identity {
    client?: ExternalApplicationClient;
    configUrl?: string;
    id: number;
    licenseKey?: string;
    nonPersistent: boolean;
    pid?: number;
    runtimeClient: boolean;
    type?: string; // authorization type e.g., 'file-token'
}

interface ExternalProcessInfo {
    parent: Identity;
}

export module ExternalApplication {
    export function addEventListener(identity: Identity, type: string, listener: Function) {
        const evt = route.externalApplication(type, identity.uuid);
        ofEvents.on(evt, listener);

        return () => {
            ofEvents.removeListener(evt, listener);
        };
    }

    export function removeEventListener(identity: Identity, type: string, listener: Function) {
        ofEvents.removeListener(route.externalApplication(type, identity.uuid), listener);
    }

    export function getInfo(externalApp: Identity): ExternalProcessInfo {
        const extProcess: any = ProcessTracker.getProcessByUuid(externalApp.uuid);
        return {
            parent: <Identity>((extProcess && extProcess.window && extProcess.window.uuid) ? extProcess.window : null)
        };
    }

    export function addExternalConnection(externalConnObj: ExternalApplicationOptions) {
        const {
            uuid
        } = externalConnObj;

        //TODO: compare perf from this and a map.
        authenticatedConnections.push(externalConnObj);
        ofEvents.emit(route.externalApplication('connected', externalConnObj.uuid), {
            uuid
        });
        ofEvents.emit(route.externalApplication('connected'), {
            uuid
        });
    }

    export function getExternalConnectionByUuid(uuid: string): ExternalApplicationOptions {
        return authenticatedConnections.find(c => {
            return c.uuid === uuid;
        });
    }

    export function getExternalConnectionById(id: number): ExternalApplicationOptions {
        return authenticatedConnections.find(c => {
            return c.id === id;
        });
    }

    export function isRuntimeClient(uuid: string) {
        const target = authenticatedConnections.find(c => {
            return c.uuid === uuid;
        });

        return target ? target.runtimeClient === true : false;
    }

    export function removeExternalConnection(externalConnection: ExternalApplicationOptions) {
        authenticatedConnections.splice(authenticatedConnections.indexOf(externalConnection), 1);

        ofEvents.emit(route.externalApplication('disconnected', externalConnection.uuid), {
            uuid: externalConnection.uuid
        });

        ofEvents.emit(route.externalApplication('disconnected'), {
            uuid: externalConnection.uuid
        });
    }

    export function getAllExternalConnctions() {
        //return a copy.
        return authenticatedConnections.slice(0);
    }

    export function createExternalApplicationOptions(externalOpts: any): ExternalApplicationOptions {
        const externalAppOptions: ExternalApplicationOptions = {
            id: externalOpts.id,
            uuid: externalOpts.uuid,
            runtimeClient: false,
            nonPersistent: false
        };

        return Object.assign(externalAppOptions, externalOpts);
    }
}
