/*
Copyright 2017 OpenFin Inc.

Licensed under OpenFin Commercial License you may not use this file except in compliance with your Commercial License.
Please contact OpenFin Inc. at sales@openfin.co to obtain a Commercial License.
*/
let fs = require('fs');
let apiProtocolBase = require('./api_protocol_base.js');
import {
    ExternalApplication
} from '../../api/external_application';
let coreState = require('../../core_state.js');
import ofEvents from '../../of_events';
let _ = require('underscore');
let log = require('../../log');
let socketServer = require('../../transports/socket_server').server;
let ProcessTracker = require('../../process_tracker.js');
const rvmMessageBus = require('../../rvm/rvm_message_bus').rvmMessageBus;
import route from '../../../common/route';
const successAck = {
    success: true
};

const AUTH_TYPE = {
    file: 0,
    sponsored: 1
};

function AuthorizationApiHandler() {
    var pendingAuthentications = new Map(),
        electronApp = require('app'),
        authenticationApiMap = {
            'request-external-authorization': onRequestExternalAuth,
            'request-authorization': onRequestAuthorization,
            'register-external-connection': {
                apiFunc: registerExternalConnection,
                apiPath: 'System.registerExternalConnection'
            }
        };

    function registerExternalConnection(identity, message, ack) {
        let uuidToRegister = message.payload.uuid;
        let token = electronApp.generateGUID();
        let dataAck = _.clone(successAck);
        dataAck.data = {
            uuid: uuidToRegister,
            token
        };

        addPendingAuthentication(uuidToRegister, token, null, identity);
        ack(dataAck);
    }

    function onRequestExternalAuth(id, message) {
        console.log('processing request-external-authorization', message);

        let {
            uuid: uuidRequested,
            pid
        } = message.payload;

        let extProcess, file, token;

        if (pid) {
            extProcess =
                ProcessTracker.getProcessByPid(pid) ||
                ProcessTracker.monitor({
                    uuid: null,
                    name: null
                }, {
                    pid,
                    uuid: uuidRequested,
                    monitor: false
                });
        }

        // UUID assignment priority: mapped process, client-requested, then auto-generated
        var uuid = (extProcess || {}).uuid || uuidRequested || electronApp.generateGUID();

        if (pendingAuthentications.has(uuid)) {
            return;
        }

        file = getAuthFile();
        token = electronApp.generateGUID();

        addPendingAuthentication(uuid, token, file);

        socketServer.send(id, JSON.stringify({
            action: 'external-authorization-response',
            payload: {
                file,
                token,
                uuid
            }
        }));
    }

    function onRequestAuthorization(id, data) {
        const uuid = data.payload.uuid;
        const authObj = pendingAuthentications.get(uuid);
        const externalConnObj = Object.assign({}, data.payload, {
            id
        });

        //Check if the file and token were written.

        authenticateUuid(authObj, data.payload, (success, error) => {
            let authorizationResponse = {
                action: 'authorization-response',
                payload: {
                    success: success
                }
            };

            if (!success) {
                authorizationResponse.payload.reason = error || 'Invalid token or file';
            }

            socketServer.send(id, JSON.stringify(authorizationResponse));

            ExternalApplication.addExternalConnection(externalConnObj);
            socketServer.connectionAuthenticated(id, uuid);

            rvmMessageBus.registerLicenseInfo({
                data: {
                    licenseKey: externalConnObj.licenseKey,
                    client: externalConnObj.client,
                    uuid,
                    parentApp: {
                        uuid: null
                    }
                }
            });

            if (!success) {
                socketServer.closeConnection(id);
            }

            cleanPendingRequest(authObj);

        });
    }

    function getAuthFile() {
        //make sure the folder exists
        return `${electronApp.getPath('userData')}-${electronApp.generateGUID()}`;
    }

    function addPendingAuthentication(uuid, token, file, sponsor) {
        let authObj = {
            uuid,
            token,
            file,
            sponsor
        };

        authObj.type = file ? AUTH_TYPE.file : AUTH_TYPE.sponsored;
        pendingAuthentications.set(uuid, authObj);
    }

    function authenticateUuid(authObj, authRequest, cb) {
        if (ExternalApplication.getExternalConnectionByUuid(authRequest.uuid)) {
            cb(false, 'Application with specified UUID already exists: ' + authRequest.uuid);
        } else if (authObj.type === AUTH_TYPE.file) {
            try {
                fs.readFile(authObj.file, (err, data) => {
                    cb(data.toString().indexOf(authObj.token) >= 0);
                });
            } catch (err) {
                //TODO: Error Strategy.
                console.log(err);
            }
        } else {
            cb(authObj.token === authRequest.token);
        }
    }

    function cleanPendingRequest(authObj) {
        if (authObj.type === AUTH_TYPE.file) {
            fs.unlink(authObj.file, err => {
                //really don't care about this error but log it either way.
                log.writeToLog('info', err);
                pendingAuthentications.delete(authObj.uuid);
            });
        }
    }

    socketServer.on(route.connection('close'), id => {
        var keyToDelete,
            externalConnection;
        for (var [key, value] of pendingAuthentications.entries()) {
            if (value.id === id) {
                pendingAuthentications.delete(key);
                break;
            }
        }
        pendingAuthentications.delete(keyToDelete);

        externalConnection = ExternalApplication.getExternalConnectionById(id);
        if (externalConnection) {
            ExternalApplication.removeExternalConnection(externalConnection);
            ofEvents.emit(route('externalconn', 'closed'), ExternalApplication);
        }

        if (coreState.shouldCloseRuntime()) {
            electronApp.quit();
        }

    });

    /*jshint unused:false */
    apiProtocolBase.registerActionMap(authenticationApiMap);
}

module.exports.AuthorizationApiHandler = AuthorizationApiHandler;
