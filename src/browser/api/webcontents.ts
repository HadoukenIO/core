import { WebContents } from 'electron';
import * as url from 'url';


export function executeJavascript(webContents: WebContents, code: string, callback: (e: any, result: any) => void): void {
    webContents.executeJavaScript(code, true, (result) => {
        callback(undefined, result);
    });
}

export function getAbsolutePath(webContents: WebContents, path: string) {
    const windowURL = webContents.getURL();
    return  url.resolve(windowURL, path);
}

export function getInfo(webContents: WebContents) {
    return {
        canNavigateBack: webContents.canGoBack(),
        canNavigateForward: webContents.canGoForward(),
        title: webContents.getTitle(),
        url: webContents.getURL()
    };
}

export function getZoomLevel(webContents: WebContents, callback: (zoomLevel: number) => void) {
    webContents.getZoomLevel(callback);
}

export function navigate (webContents: WebContents, url: string) {
    webContents.loadURL(url);
}

export function navigateBack (webContents: WebContents) {
    webContents.goBack();
}

export function navigateForward (webContents: WebContents) {
    webContents.goForward();
}

export function reload(webContents: WebContents, ignoreCache: boolean = false) {
    if (!ignoreCache) {
        webContents.reload();
    } else {
        webContents.reloadIgnoringCache();
    }
}

export function setZoomLevel(webContents: WebContents, level: number) {
    // webContents.setZoomLevel(level); // zooms all windows loaded from same domain
    webContents.send('zoom', { level }); // zoom just this window
}

export function stopNavigation(webContents: WebContents) {
    webContents.stop();
}
