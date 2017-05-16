/*
Copyright 2017 OpenFin Inc.

Licensed under OpenFin Commercial License you may not use this file except in compliance with your Commercial License.
Please contact OpenFin Inc. at sales@openfin.co to obtain a Commercial License.
*/

import ofEvents from '../of_events';

import { Identity } from '../../shapes';

import * as ProcessTracker from '../process_tracker.js';

const authenticatedConnections: any[] = [];
const connectedEvent = 'external-application/connected';
const disconnectedEvent = 'external-application/disconnected';

export module ExternalApplication {
    export function addEventListener(identity: Identity, type: string, listener: Function) {
        const evt = `external-application/${type}/${identity.uuid}`;
        ofEvents.on(evt, listener);

        return () => {
            ofEvents.removeListener(evt, listener);
        };
    }

    export function removeEventListener(identity: Identity, type: string, listener: Function) {
        ofEvents.removeListener(`external-application/${type}/${identity.uuid}`, listener);
    }

    export function getInfo(externalApp: Identity): ExternalProcessInfo {
        const extProcess: any = ProcessTracker.getProcessByUuid(externalApp.uuid);
        return {
            parent: <Identity>((extProcess && extProcess.window && extProcess.window.uuid) ? extProcess.window : null)
        };
    }

    export function addExternalConnection(externalConnObj: Identity) {
        const {
            uuid
        } = externalConnObj;

        //TODO: compare perf from this and a map.
        authenticatedConnections.push(externalConnObj);
        ofEvents.emit(`${connectedEvent}/${externalConnObj.uuid}`, {
            uuid
        });
        ofEvents.emit(connectedEvent, {
            uuid
        });
    }

    export function getExternalConnectionByUuid(uuid: string) {
        return authenticatedConnections.find(c => {
            return c.uuid === uuid;
        });
    }

    export function getExternalConnectionById(id: number) {
        return authenticatedConnections.find(c => {
            return c.id === id;
        });
    }

    export function removeExternalConnection(externalConnection: Identity) {
        authenticatedConnections.splice(authenticatedConnections.indexOf(externalConnection), 1);

        ofEvents.emit(`${disconnectedEvent}/${externalConnection.uuid}`, {
            uuid: externalConnection.uuid
        });

        ofEvents.emit(disconnectedEvent, {
            uuid: externalConnection.uuid
        });
    }

    export function getAllExternalConnctions() {
        //return a copy.
        return authenticatedConnections.slice(0);
    }

    interface ExternalProcessInfo {
        parent: Identity;
    }
}
