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
import { app } from 'electron';
import { AuthCallback, Identity, ResourceFetchIdentity } from '../shapes';

const pendingAuthRequests: Map<string, AuthRequest> = new Map();

interface AuthRequest {
    authCallback: AuthCallback;
    authInfo: any;
    identity: Identity;
}

function generateId(identity: Identity): string {
    const { uuid, name } = identity;
    return `${uuid}-${name}`;
}

export function addPendingAuthRequests(identity: Identity, authInfo: any, authCallback: AuthCallback): void {
    const id = generateId(identity);
    pendingAuthRequests.set(id, { authCallback, authInfo, identity });
}

export function getPendingAuthRequest(identity: Identity): AuthRequest {
    const id = generateId(identity);
    return pendingAuthRequests.get(id);
}

export function deletePendingAuthRequest(identity: Identity): void {
    const id = generateId(identity);
    pendingAuthRequests.delete(id);
}

export function createAuthUI(identity: ResourceFetchIdentity): void {
    // prevent issue with circular dependencies.
    const Application = require('./api/application.js').Application;
    const appId = `auth-app-${app.generateGUID()}`;
    const uriUuid = encodeURIComponent(identity.uuid);
    const uriName = encodeURIComponent(identity.name);
    const resourceFetch = identity.resourceFetch || false;

    Application.create({
        url: `file:///${__dirname}/../login/index.html?uuid=${uriUuid}&name=${uriName}&resourceFetch=${resourceFetch}`,
        uuid: appId,
        name: appId,
        mainWindowOptions: {
            alwaysOnTop: true,
            autoShow: true,
            defaultCentered: true,
            defaultHeight: 271,
            defaultTop: true,
            defaultWidth: 362,
            frame: false,
            resizable: false
        },
        _runtimeAuthDialog: true // skip checks for shouldCloseRuntime
    });

    Application.run({ uuid: appId });
}
