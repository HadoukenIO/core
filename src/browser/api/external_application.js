/*
Copyright 2017 OpenFin Inc.

Licensed under OpenFin Commercial License you may not use this file except in compliance with your Commercial License.
Please contact OpenFin Inc. at sales@openfin.co to obtain a Commercial License.
*/
import ofEvents from '../of_events';

function addEventListener(identity, type, listener) {
    let evt = `externalapplication/${type}/${identity.uuid}`;
    ofEvents.on(evt, listener);

    return function() {
        ofEvents.removeListener(evt, listener);
    };
}

function removeEventListener(identity, type, listener) {
    ofEvents.removeListener(`externalapplication/${type}/${identity.uuid}`, listener);
}

module.exports.ExternalConnections = {
    addEventListener,
    removeEventListener
};
