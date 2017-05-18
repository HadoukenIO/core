/*
Copyright 2017 OpenFin Inc.

Licensed under OpenFin Commercial License you may not use this file except in compliance with your Commercial License.
Please contact OpenFin Inc. at sales@openfin.co to obtain a Commercial License.
*/
import { app } from 'electron';

let rvmBus: any;
app.on('ready', function() {
    rvmBus = require('../rvm/rvm_message_bus').rvmMessageBus;
});

/**
 * Interface for [sendToRVM] method
 */
interface SendToRVMOpts {
    topic: 'application';
    action: string;
    sourceUrl?: string;
    data?: any;
}

/**
 * Helper that uses RVM bus to send and receive payloads to/from RVM
 */
export function sendToRVM(opts: SendToRVMOpts): Promise<any> {
    return new Promise((resolve, reject) => {
        const {
            topic,
            action,
            sourceUrl, // manifest url
            data
        } = opts;

        const payload = {
            action,
            sourceUrl,
            data
        };

        // Make sure there is a connection with RVM
        if (!rvmBus) {
            return reject(new Error('Connection with RVM is not established'));
        }

        const messageSent = rvmBus.send(topic, payload, (rvmResponse: any) => {

            // Don't do anything here because the message wasn't sent successfully to RVM
            // and we already sent error callback to the client
            if (!messageSent) {
                return;
            }

            // Not standard response
            if (typeof rvmResponse !== 'object') {
                return resolve(rvmResponse);
            }

            // Expired communication (waited to long to get the response)
            if (rvmResponse.hasOwnProperty('time-to-live-expiration')) {
                return reject(new Error('Unable to receive RVM response in a reasonable amount of time'));
            }

            // Communication error
            if (rvmResponse.success === false) {
                return reject(new Error(rvmResponse.error));
            }

            // Action execution error
            if (rvmResponse.payload && rvmResponse.payload.status === false) {
                return reject(new Error(rvmResponse.payload.error));
            }

            // Prepare a clean response for the user
            let payload = Object.assign({}, rvmResponse.payload);
            delete payload['action'];
            delete payload['status'];
            delete payload['error'];
            if (Object.keys(payload).length === 0) {
                payload = undefined;
            }

            resolve(payload);

        }, 1000);

        if (!messageSent) {
            reject(new Error('Failed to send a message to the RVM'));
        }
    });
}
