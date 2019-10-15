import * as url from 'url';
import { app } from 'electron';
import { Identity } from '../../shapes';
import ofEvents from '../of_events';
import route, { WindowRoute } from '../../common/route';
import { InjectableContext, EntityType } from '../../shapes';
import { prepareConsoleMessageForRVM } from '../rvm/utils';


export function hookWebContentsEvents(webContents: Electron.WebContents, { uuid, name }: Identity, topic: string, routeFunc: WindowRoute) {
    webContents.on('did-get-response-details', (e,
        status,
        newUrl,
        originalUrl,
        httpResponseCode,
        requestMethod,
        referrer,
        headers,
        resourceType
    ) => {
        const type = 'resource-response-received';

        const payload = { uuid, name, topic, type,
            status,
            newUrl,
            originalUrl,
            httpResponseCode,
            requestMethod,
            referrer,
            headers,
            resourceType
        };
        ofEvents.emit(routeFunc(type, uuid, name), payload);
    });

    webContents.on('did-fail-load', (e,
        errorCode,
        errorDescription,
        validatedURL,
        isMainFrame
    ) => {
        const type = 'resource-load-failed';
        const payload = { uuid, name, topic, type,
            errorCode,
            errorDescription,
            validatedURL,
            isMainFrame
        };
        ofEvents.emit(routeFunc(type, uuid, name), payload);
    });

    webContents.on('page-title-updated', (e, title, explicitSet) => {
        const type = 'page-title-updated';
        const payload = {uuid, name, topic, type, title, explicitSet};
        ofEvents.emit(routeFunc(type, uuid, name), payload);
    });

    webContents.on('did-change-theme-color', (e, color) => {
        const type = 'did-change-theme-color';
        const payload = {uuid, name, topic, type, color};
        ofEvents.emit(routeFunc(type, uuid, name), payload);
    });

    webContents.on('page-favicon-updated', (e, favicons) => {
        const type = 'page-favicon-updated';
        const payload = {uuid, name, topic, type, favicons};
        ofEvents.emit(routeFunc(type, uuid, name), payload);
    });

    const isMainWindow = (uuid === name);
    const emitToAppIfMainWin = (type: string, payload: any) => {
        if (isMainWindow) {
            // Application crashed: inform Application "namespace"
            ofEvents.emit(route.application(type, uuid), Object.assign({ topic: 'application', type, uuid }, payload));
        }
    };

    webContents.on('crashed', (e, killed, terminationStatus) => {
        const type = 'crashed';
        const payload = {uuid, name, topic, type, reason: terminationStatus};
        ofEvents.emit(routeFunc(type, uuid, name), payload);
        emitToAppIfMainWin(type, payload);
    });

    webContents.on('responsive', () => {
        const type = 'responding';
        const payload = {uuid, name, topic, type};
        ofEvents.emit(routeFunc(type, uuid, name), payload);
        emitToAppIfMainWin(type, payload);
    });

    webContents.on('unresponsive', () => {
        const type = 'not-responding';
        const payload = {uuid, name, topic, type};
        ofEvents.emit(routeFunc(type, uuid, name), payload);
        emitToAppIfMainWin(type, payload);
    });

    webContents.once('destroyed', () => {
        webContents.removeAllListeners();
    });
    webContents.on('console-message', (...args) => prepareConsoleMessageForRVM({ uuid, name }, ...args));
}

export function executeJavascript(webContents: Electron.WebContents, code: string): Promise<any> {
    return webContents.executeJavaScript(code, true);
}

export function getInfo(webContents: Electron.WebContents) {
    return {
        canNavigateBack: webContents.canGoBack(),
        canNavigateForward: webContents.canGoForward(),
        title: webContents.getTitle(),
        url: webContents.getURL()
    };
}

export function getAbsolutePath(webContents: Electron.WebContents, path: string) {
    const windowURL = webContents.getURL();
    return url.resolve(windowURL, path);
}

export function navigate (webContents: Electron.WebContents, url: string) {
    return webContents.loadURL(url);
}

export async function navigateBack(webContents: Electron.WebContents) {
    const navigationEnd = createNavigationEndPromise(webContents);
    webContents.goBack();
    return navigationEnd;
}

export async function navigateForward(webContents: Electron.WebContents) {
    const navigationEnd = createNavigationEndPromise(webContents);
    webContents.goForward();
    return navigationEnd;
}

export function getZoomLevel(webContents: Electron.WebContents, callback: (zoomLevel: number) => void) {
    callback(webContents.getZoomLevel());
}

export function reload(webContents: Electron.WebContents, ignoreCache: boolean = false) {
    if (!ignoreCache) {
        webContents.reload();
    } else {
        webContents.reloadIgnoringCache();
    }
}

export function setZoomLevel(webContents: Electron.WebContents, level: number) {
    // webContents.setZoomLevel(level); // zooms all windows loaded from same domain
    webContents.send('zoom', { level }); // zoom just this window
}

export function stopNavigation(webContents: Electron.WebContents) {
    webContents.stop();
}

function createNavigationEndPromise(webContents: Electron.WebContents): Promise<void> {
    return new Promise((resolve, reject) => {
        const chromeErrCodesLink = 'https://cs.chromium.org/chromium/src/net/base/net_error_list.h';
        const didFail = (event: Electron.Event, errCode: number) => {
            // tslint:disable-next-line: no-use-before-declare
            webContents.removeListener('did-finish-load', didSucceed);
            const error = new Error(`error #${errCode}. See ${chromeErrCodesLink} for details`);
            reject(error);
        };
        const didSucceed = () => {
            webContents.removeListener('did-fail-load', didFail);
            resolve();
        };
        webContents.once('did-fail-load', didFail);
        webContents.once('did-finish-load', didSucceed);
    });
}


export function setIframeHandlers (webContents: Electron.WebContents, contextObj: InjectableContext, uuid: string, name: string) {
    webContents.registerIframe = (frameName: string, frameRoutingId: number) => {
        // called for all iframes, but not for main frame of windows
        app.vlog(1, `registerIframe ${frameName} ${frameRoutingId}`);
        const frameInfo = {
            name: frameName,
            uuid,
            parent: { uuid, name },
            frameRoutingId,
            entityType: EntityType.IFRAME
        };

        contextObj.frames.set(frameName, frameInfo);
    };

    // called in the WebContents class in the runtime
    webContents.unregisterIframe = (closedFrameName: string, frameRoutingId: number) => {
        // called for all iframes AND for main frames
        app.vlog(1, `unregisterIframe ${frameRoutingId} ${closedFrameName}`);
        const frameName = closedFrameName || name; // the parent name is considered a frame as well
        const frameInfo = contextObj.frames.get(closedFrameName);
        const entityType = frameInfo ? 'iframe' : 'window';
        const payload = { uuid, name, frameName, entityType };
        contextObj.frames.delete(closedFrameName);
        ofEvents.emit(route.frame('disconnected', uuid, closedFrameName), payload);
        ofEvents.emit(route.window('frame-disconnected', uuid, name), payload);
    };
}
