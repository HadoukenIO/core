import { Identity, APIMessage, Acker, APIPayloadAck } from '../../../shapes';

import { getTargetWindowIdentity, registerActionMap } from './api_protocol_base';

import * as WebContents from '../../api/webcontents';
import { getWindowByUuidName } from '../../core_state';
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
    'set-zoom-level': setZoomLevel
};
export function init () {
    registerActionMap(webContentsApiMap, 'Window');
}
function executeJavascript(identity: Identity, message: APIMessage, ack: Acker, nack: (error: Error) => void): void {
    const { payload } = message;
    const { code } = payload;
    const dataAck = Object.assign({}, successAck);
    const windowIdentity = getTargetWindowIdentity(payload);
    const browserWin = getElectronBrowserWindow(windowIdentity);

    let { uuid: pUuid } = windowIdentity;

    while (pUuid) {
        if (pUuid === identity.uuid) {
            return WebContents.executeJavascript(browserWin.webContents, code, (err: Error, result: any) => {
                if (err) {
                    nack(err); // TODO: this nack doesn't follow the protocol
                } else {
                    dataAck.data = result;
                    ack(dataAck);
                }
            });
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
    const browserWin = getElectronBrowserWindow(windowIdentity);

    WebContents.navigate(browserWin.webContents, url)
        .then(() => ack(successAck))
        .catch(nack);
}
function navigateWindowBack(identity: Identity, message: APIMessage, ack: Acker, nack: (error: Error) => void): void {
    const { payload } = message;
    const windowIdentity = getTargetWindowIdentity(payload);
    const browserWin = getElectronBrowserWindow(windowIdentity);

    WebContents.navigateBack(browserWin.webContents)
        .then(() => ack(successAck))
        .catch(nack);
}

function navigateWindowForward(identity: Identity, message: APIMessage, ack: Acker, nack: (error: Error) => void): void {
    const { payload } = message;
    const windowIdentity = getTargetWindowIdentity(payload);
    const browserWin = getElectronBrowserWindow(windowIdentity);

    WebContents.navigateForward(browserWin.webContents)
        .then(() => ack(successAck))
        .catch(nack);
}

function stopWindowNavigation(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const windowIdentity = getTargetWindowIdentity(payload);
    const browserWin = getElectronBrowserWindow(windowIdentity);

    WebContents.stopNavigation(browserWin.webContents);
    ack(successAck);
}

function reloadWindow(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const { ignoreCache } = payload;
    const windowIdentity = getTargetWindowIdentity(payload);
    const browserWin = getElectronBrowserWindow(windowIdentity);

    WebContents.reload(browserWin.webContents, ignoreCache);
    ack(successAck);
}
function getZoomLevel(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const dataAck = Object.assign({}, successAck);
    const windowIdentity = getTargetWindowIdentity(payload);
    const browserWin = getElectronBrowserWindow(windowIdentity);

    WebContents.getZoomLevel(browserWin.webContents, (result: number) => {
        dataAck.data = result;
        ack(dataAck);
    });
}

function setZoomLevel(identity: Identity, message: APIMessage, ack: Acker): void {
    const { payload } = message;
    const { level } = payload;
    const windowIdentity = getTargetWindowIdentity(payload);
    const browserWin = getElectronBrowserWindow(windowIdentity);

    WebContents.setZoomLevel(browserWin.webContents, level);
    ack(successAck);
}

//If unknown window AND `errDesc` provided, throw error; otherwise return (possibly undefined) browser window ref.
export function getElectronBrowserWindow({uuid, name}: Identity, errDesc?: string) {
    const openfinWindow = getWindowByUuidName(uuid, name);
    const browserWindow = openfinWindow && openfinWindow.browserWindow;

    if (errDesc && !browserWindow) {
        throw new Error(`Could not ${errDesc} unknown window named '${name}'`);
    }

    return browserWindow;
}