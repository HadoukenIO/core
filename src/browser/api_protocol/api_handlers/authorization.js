let fs = require('fs');
let apiProtocolBase = require('./api_protocol_base.js');
import {
    ExternalApplication
} from '../../api/external_application';
let coreState = require('../../core_state.js');
import ofEvents from '../../of_events';
let _ = require('underscore');
let log = require('../../log');
import socketServer from '../../transports/socket_server';
import ProcessTracker from '../../process_tracker';
const rvmMessageBus = require('../../rvm/rvm_message_bus').rvmMessageBus;
import route from '../../../common/route';
import { lockUuid, releaseUuid } from '../../uuid_availability';
const successAck = {
    success: true
};

const AUTH_TYPE = {
    file: 0,
    sponsored: 1
};

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

    addPendingAuthentication(uuidToRegister, token, null, identity, null);
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
    const uuid = (extProcess || {}).uuid || uuidRequested || electronApp.generateGUID();

    if (pendingAuthentications.has(uuid)) {
        return;
    }

    file = getAuthFile();
    token = electronApp.generateGUID();

    addPendingAuthentication(uuid, token, file, null, message.payload);

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
    if (authObj && authObj.authReqPayload) {
        externalConnObj.configUrl = authObj.authReqPayload.configUrl;
    }

    //issue with older adapters where part of the data is comming from different locations;
    const externalApplicationOptions = ExternalApplication.createExternalApplicationOptions(Object.assign({}, authObj.authReqPayload, externalConnObj));
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
        if (success) {
            ExternalApplication.addExternalConnection(externalApplicationOptions);
            socketServer.connectionAuthenticated(id, uuid);

            rvmMessageBus.registerLicenseInfo({
                data: {
                    licenseKey: externalApplicationOptions.licenseKey,
                    client: externalApplicationOptions.client,
                    uuid,
                    parentApp: {
                        uuid: null,
                        configUrl: null
                    }
                }
            }, externalApplicationOptions.configUrl);
        } else {
            socketServer.closeConnection(id);
        }

        cleanPendingRequest(authObj);

    });
}

function getAuthFile() {
    //make sure the folder exists
    return `${electronApp.getPath('userData')}-${electronApp.generateGUID()}`;
}

function addPendingAuthentication(uuid, token, file, sponsor, authReqPayload) {
    let authObj = {
        uuid,
        token,
        file,
        sponsor,
        authReqPayload
    };

    authObj.type = file ? AUTH_TYPE.file : AUTH_TYPE.sponsored;
    pendingAuthentications.set(uuid, authObj);
}

function authenticateUuid(authObj, authRequest, cb) {
    if (ExternalApplication.getExternalConnectionByUuid(authRequest.uuid) || coreState.getAppByUuid(authRequest.uuid) || !(authRequest.runtimeClient || lockUuid(authRequest.uuid))) {
        cb(false, 'Application with specified UUID already exists: ' + authRequest.uuid);
    } else if (!authObj) {
        cb(false, 'Invalid UUID: ' + authRequest.uuid);
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
    if (authObj && authObj.type === AUTH_TYPE.file) {
        fs.unlink(authObj.file, err => {
            //really don't care about this error but log it either way.
            log.writeToLog('info', err);
            pendingAuthentications.delete(authObj.uuid);
        });
    }
}

export const init = function() {
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
            if (!externalConnection.runtimeClient) {
                releaseUuid(externalConnection.uuid);
            }
            ofEvents.emit(route('externalconn', 'closed'), externalConnection);
        }

        if (coreState.shouldCloseRuntime()) {
            electronApp.quit();
        }

    });

    /*jshint unused:false */
    apiProtocolBase.registerActionMap(authenticationApiMap);
};

const isConnectionAuthenticated = (msg, next) => {
    const { data, nack, identity, strategyName } = msg;
    const { runtimeUuid, uuid } = identity;
    const action = data && data.action;
    const uuidToCheck = runtimeUuid || uuid; //determine if the msg came as a forwarded action from a peer runtime.

    // Prevent all API calls from unauthenticated external connections,
    // except for authentication APIs
    if (
        strategyName === 'WebSocketStrategy' && // external connection
        !authenticationApiMap.hasOwnProperty(action) && // not an authentication action
        !ExternalApplication.getExternalConnectionByUuid(uuidToCheck) // connection not authenticated
    ) {
        return nack(new Error('This connection must be authenticated first'));
    }

    next();
};

export const registerMiddleware = function(requestHandler) {
    requestHandler.addPreProcessor(isConnectionAuthenticated);
};
