import { Identity, APIMessage, Acker, APIPayloadAck } from '../../../shapes';

import { getTargetWindowIdentity, registerActionMap } from './api_protocol_base';

import * as WebContents from '../../api/webcontents';
import * as Preload from '../../preload_scripts';
import { getWindowByUuidName, getBrowserViewByIdentity } from '../../core_state';
const { Application } = require('../../api/application');
const successAck: APIPayloadAck = { success: true };

export const webContentsApiMap = {
    'execute-javascript-in-window': { apiFunc: executeJavascript, apiPath: '.executeJavaScript' },
    'get-zoom-level': getZoomLevel,
    'navigate-window': navigateWindow,
    'navigate-window-back': navigateWindowBack,
    'navigate-window-forward': navigateWindowForward,
    'stop-window-navigation': stopWindowNavigation,
    'reload-window': reloadWindow,
    'set-zoom-level': setZoomLevel,
    'set-window-preload-state': setWindowPreloadState
};
export function init () {
    registerActionMap(webContentsApiMap, 'Window');
}
async function executeJavascript(identity: Identity, message: APIMessage, ack: Acker, nack: (error: Error) => void) {
    const { payload } = message;
    const { code } = payload;
    const dataAck = Object.assign({}, successAck);
    const windowIdentity = getTargetWindowIdentity(payload);
    const webContents = getElectronWebContents(windowIdentity);

    let { uuid: pUuid } = windowIdentity;

    while (pUuid) {
        if (pUuid === identity.uuid) {
            dataAck.data = await WebContents.executeJavascript(webContents, code);
            return dataAck;
        }
        pUuid = Application.getParentApplication({
            uuid: pUuid
        });
    }

    return nack(new Error('Rejected, target window is not owned by requesting identity'));
}
function navigateWindow(identity: Identity, message: APIMessage, ack: Acker, nack: (error: Error) => void): void {
    const { payload } = message;
    const { url } = payload;
    const windowIdentity = getTargetWindowIdentity(payload);
    const webContents = getElectronWebContents(windowIdentity);

    WebContents.navigate(webContents, url)
        .then(() => ack(successAck))
        .catch(nack);
}
function navigateWindowBack(identity: Identity, message: APIMessage, ack: Acker, nack: (error: Error) => void): void {
    const { payload } = message;
    const windowIdentity = getTargetWindowIdentity(payload);
    const webContents = getElectronWebContents(windowIdentity);

    WebContents.navigateBack(webContents)
        .then(() => ack(successAck))
        .catch(nack);
}

function navigateWindowForward(identity: Identity, message: APIMessage, ack: Acker, nack: (error: Error) => void): void {
    const { payload } = message;
    const windowIdentity = getTargetWindowIdentity(payload);
    const webContents = getElectronWebContents(windowIdentity);

    WebContents.navigateForward(webContents)
        .then(() => ack(successAck))
        .catch(nack);
}

function stopWindowNavigation(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const windowIdentity = getTargetWindowIdentity(payload);
    const webContents = getElectronWebContents(windowIdentity);

    WebContents.stopNavigation(webContents);
    ack(successAck);
}

function reloadWindow(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const { ignoreCache } = payload;
    const windowIdentity = getTargetWindowIdentity(payload);
    const webContents = getElectronWebContents(windowIdentity);

    WebContents.reload(webContents, ignoreCache);
    ack(successAck);
}
function getZoomLevel(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const dataAck = Object.assign({}, successAck);
    const windowIdentity = getTargetWindowIdentity(payload);
    const webContents = getElectronWebContents(windowIdentity);

    WebContents.getZoomLevel(webContents, (result: number) => {
        dataAck.data = result;
        ack(dataAck);
    });
}

function setZoomLevel(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const { level } = payload;
    const windowIdentity = getTargetWindowIdentity(payload);
    const webContents = getElectronWebContents(windowIdentity);

    WebContents.setZoomLevel(webContents, level);
    ack(successAck);
}
function setWindowPreloadState(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const windowIdentity = getTargetWindowIdentity(identity);

    Preload.setWindowPreloadState(windowIdentity, payload);
    ack(successAck);
}

//If unknown window AND `errDesc` provided, throw error; otherwise return (possibly undefined) browser window ref.
export function getElectronWebContents({uuid, name}: Identity, errDesc?: string) {
    const openfinWindow = getWindowByUuidName(uuid, name);
    const browserWindowOrView = (openfinWindow && openfinWindow.browserWindow) || getBrowserViewByIdentity({ uuid, name }).view;
    const webContents = browserWindowOrView.webContents;

    if (errDesc && !webContents) {
        throw new Error(`Could not ${errDesc} unknown Window or BrowserView named '${name}'`);
    }

    return webContents;
}