/*
Copyright 2017 OpenFin Inc.

Licensed under OpenFin Commercial License you may not use this file except in compliance with your Commercial License.
Please contact OpenFin Inc. at sales@openfin.co to obtain a Commercial License.
*/
import ofEvents from '../of_events';

let authenticatedConnections = [];
const connectedEvent = 'external-application/connected';
const disconnectedEvent = 'external-application/disconnected';

function addExternalConnection(externalConnObj) {
    const {
        uuid
    } = externalConnObj;

    //TODO: compare perf from this and a map.
    authenticatedConnections.push(externalConnObj);
    ofEvents.emit(connectedEvent + `/${externalConnObj.uuid}`, {
        uuid
    });
    ofEvents.emit(connectedEvent, {
        uuid
    });
}

function getExternalConnectionByUuid(uuid) {
    return authenticatedConnections.find(function(c) {
        return c.uuid === uuid;
    });
}

function getExternalConnectionById(id) {
    return authenticatedConnections.find(function(c) {
        return c.id === id;
    });
}

function removeExternalConnection(externalConnection) {
    authenticatedConnections.splice(authenticatedConnections.indexOf(externalConnection), 1);

    ofEvents.emit(disconnectedEvent + `/${externalConnection.uuid}`, {
        uuid: externalConnection.uuid
    });

    ofEvents.emit(disconnectedEvent, {
        uuid: externalConnection.uuid
    });
}

function getAllExternalConnctions() {
    //return a copy.
    return authenticatedConnections.slice(0);
}

module.exports = {
    addExternalConnection,
    getExternalConnectionByUuid,
    getExternalConnectionById,
    removeExternalConnection,
    getAllExternalConnctions
};
