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
        url: `file:///${__dirname}/../../assets/login.html?uuid=${uriUuid}&name=${uriName}&resourceFetch=${resourceFetch}`,
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
