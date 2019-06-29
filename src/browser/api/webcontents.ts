import * as url from 'url';

export function executeJavascript(webContents: Electron.WebContents, code: string, callback: (e: any, result: any) => void): void {
    webContents.executeJavaScript(code, true, (result) => {
        callback(undefined, result);
    });
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
    return  url.resolve(windowURL, path);
}

export function navigate (webContents: Electron.WebContents, url: string) {
    // todo: replace everything here with "return webContents.loadURL(url)" once we get to electron 5.*
    // reason: starting electron v5, loadUrl returns a promise that resolves according to the same logic we apply here
    const navigationEnd = createNavigationEndPromise(webContents);
    webContents.loadURL(url);
    return navigationEnd;
}

export async function navigateBack (webContents: Electron.WebContents) {
    const navigationEnd = createNavigationEndPromise(webContents);
    webContents.goBack();
    return navigationEnd;
}

export async function navigateForward (webContents: Electron.WebContents) {
    const navigationEnd = createNavigationEndPromise(webContents);
    webContents.goForward();
    return navigationEnd;
}

export function getZoomLevel(webContents: Electron.WebContents, callback: (zoomLevel: number) => void) {
    webContents.getZoomLevel(callback);
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
