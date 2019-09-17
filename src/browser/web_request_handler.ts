
/*
    Intercept and modify the contents of a request at various stages of its lifetime, based on
    https://github.com/openfin/runtime/blob/develop/docs/api/web-request.md

    v1: handler for onBeforeSendHeaders
 */

import * as coreState from './core_state';
const electronApp = require('electron').app;
const { session, webContents } = require('electron');

import * as Shapes from '../shapes';

const moduleName: string = 'WebRequestHandlers';  // for logging

// passed to webRequest.onBeforeSendHeaders
interface RequestDetails {
    id: number;
    url: string;
    method: string;
    resourceType: string;
    requestHeaders: any;
    renderProcessId?: number; // not set if the request is not associated with a window
    renderFrameId?: number;
}

// passed to callback of webRequest.onBeforeSendHeaders
interface HeadersResponse {
    cancel: boolean;
    requestHeaders?: any;
}

function matchUrlPatterns(url: string, config: Shapes.WebRequestHeaderConfig): boolean {
    let match: boolean = false;
    if (config.urlPatterns && config.urlPatterns.length > 0) {
        match = electronApp.matchesURL(url, config.urlPatterns);
    }
    return match;
}

function applyHeaders(requestHeaders: any, config: Shapes.WebRequestHeaderConfig): void {
    if (config.headers && config.headers.length > 0) {
        config.headers.forEach((header) => {
            Object.keys(header).forEach(key => {
                requestHeaders[key] = header[key];
            });
        });
    }
}

function beforeSendHeadersHandler(details: RequestDetails, callback: (response: HeadersResponse) => void): void {
    if (details.renderProcessId && details.renderFrameId) {
        const wc = webContents.fromProcessAndFrameIds(details.renderProcessId, details.renderFrameId);
        if (wc) {
            electronApp.vlog(1, `${moduleName}:beforeSendHeadersHandler got webcontents ${wc.id}`);
            if (typeof wc.id === 'number') {
                const opts = coreState.getWindowOptionsById(wc.id);
                electronApp.vlog(1, `${moduleName}:beforeSendHeadersHandler window opts ${JSON.stringify(opts)}`);
                if (opts && opts.customRequestHeaders) {
                    for (const rhItem of opts.customRequestHeaders) {
                        if (matchUrlPatterns(details.url, rhItem)) {
                            applyHeaders(details.requestHeaders, rhItem);
                        }
                    }
                }
            } // bw can be undefined during close of the window
        } else {
            electronApp.vlog(1, `${moduleName}:beforeSendHeadersHandler missing webContent`);
        }
    }

    callback({ cancel: false, requestHeaders: details.requestHeaders });
}

/**
 * Initialize web request handlers
 */
export function initHandlers(): void {
    electronApp.vlog(1, `init ${moduleName}`);

    session.defaultSession.webRequest.onBeforeSendHeaders(beforeSendHeadersHandler);
}
