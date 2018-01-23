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
let electronApp = require('electron').app;

let pendingAuthRequests = new Map();
let appIdPrefix = 'auth-app';

function addPendingAuthRequests(identity, authInfo, authCallback) {
    let {
        uuid,
        name
    } = identity;
    pendingAuthRequests.set(`${uuid}-${name}`, {
        authInfo,
        authCallback,
        identity
    });
}

function getPendingAuthRequest(identity) {
    let {
        uuid,
        name
    } = identity;
    return pendingAuthRequests.get(`${uuid}-${name}`);
}

function deletePendingAuthRequest(identity) {
    let {
        uuid,
        name
    } = identity;
    return pendingAuthRequests.delete(`${uuid}-${name}`);
}

function createAuthUI(identity) {
    //prevent issue with circular dependencies.
    let Application = require('./api/application.js').Application;
    let appId = `${appIdPrefix}-${electronApp.generateGUID()}`;
    let uriUuid = encodeURIComponent(identity.uuid);
    let uriName = encodeURIComponent(identity.name);
    const resourceFetch = identity.resourceFetch || false;
    Application.create({
        url: `file:///${__dirname}/../login/index.html?uuid=${uriUuid}&name=${uriName}&resourceFetch=${resourceFetch}`,
        uuid: appId,
        name: appId,
        mainWindowOptions: {
            defaultWidth: 362,
            defaultHeight: 271,
            autoShow: true,
            resizable: false,
            alwaysOnTop: true,
            defaultCentered: true,
            defaultTop: true,
            frame: false
        },
        _runtimeAuthDialog: true // skip checks for shouldCloseRuntime
    });

    Application.run({
        uuid: appId
    });
}

module.exports = {
    addPendingAuthRequests,
    getPendingAuthRequest,
    deletePendingAuthRequest,
    createAuthUI
};
