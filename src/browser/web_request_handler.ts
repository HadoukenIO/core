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

/*
    Intercept and modify the contents of a request at various stages of its lifetime, based on
    https://github.com/openfin/runtime/blob/develop/docs/api/web-request.md

    v1: handler for onBeforeSendHeaders
 */

const coreState = require('./core_state');
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

interface AppUuidFilterUrlMap {
    [uuid: string]: Shapes.WebRequestHeaderConfig[];  // app UUID => custom header settings
}
const filterMap: AppUuidFilterUrlMap = {};

interface UrlHeaderMap {
    [urlPattern: string]: Shapes.WebRequestHeader[];  // URL pattern => list of headers
}
let headerMap: UrlHeaderMap = {};  // reset for every app started and closed

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
                electronApp.vlog(1, `${moduleName}:beforeSendHeadersHandler setting ${key} = ${header[key]}`);
            });
        });
    }
}

function beforeSendHeadersHandler(details: RequestDetails, callback: (response: HeadersResponse) => void): void {
    electronApp.vlog(1, `${moduleName}:beforeSendHeadersHandler for ${JSON.stringify(details)}`);
    let headerAdded: boolean = false;

    if (details.renderProcessId && details.renderFrameId) {
        const wc = webContents.fromProcessAndFrameIds(details.renderProcessId, details.renderFrameId);
        if (wc) {
            electronApp.vlog(1, `${moduleName}:beforeSendHeadersHandler got webcontents ${wc.id}`);
            const bw = wc.getOwnerBrowserWindow();
            if (bw && typeof bw.id === 'number') {
                const opts: Shapes.WindowOptions = coreState.getWindowOptionsById(bw.id);
                electronApp.vlog(1, `${moduleName}:beforeSendHeadersHandler window opts ${JSON.stringify(opts)}`);
                if (opts && opts.customRequestHeaders) {
                    for (const rhItem of opts.customRequestHeaders) {
                        if (matchUrlPatterns(details.url, rhItem)) {
                            applyHeaders(details.requestHeaders, rhItem);
                            headerAdded = true;
                        }
                    }
                }
            } // bw can be undefined during close of the window
        } else {
            electronApp.vlog(1, `${moduleName}:beforeSendHeadersHandler missing webContent`);
        }
    }

    if (headerAdded) {
        callback({ cancel: false, requestHeaders: details.requestHeaders });
    } else {
        callback({ cancel: false });
    }
}

interface AppCreatedEvent {
    topic: string;
    type: string;
    uuid: string;
}

function updateHeaderFilter(): void {
    let urls: string[] = [];
    headerMap = {};

    electronApp.vlog(1, `${moduleName}:updateHeaderFilter for ${JSON.stringify(filterMap)}`);

    Object.keys(filterMap).forEach(uuid => {
        const options: Shapes.WebRequestHeaderConfig[] = filterMap[uuid];
        for (const opt of options) {
            electronApp.vlog(1, `${moduleName}:updateHeaderFilter2 for ${JSON.stringify(opt)}`);
            urls = urls.concat(opt.urlPatterns);
            for (const url of opt.urlPatterns) {
                if (!headerMap[url]) {
                    headerMap[url] = [];
                }
                headerMap[url] = headerMap[url].concat(opt.headers);
            }
        }
    });
    const filers = { urls: JSON.stringify(urls) };
    electronApp.vlog(1, `${moduleName}:updateHeaderFilter for ${JSON.stringify(filers)} headers ${JSON.stringify(headerMap)}`);
}

/**
 * Initialize web request handlers
 */
export function initHandlers(): void {
    electronApp.vlog(1, `init ${moduleName}`);

    session.defaultSession.webRequest.onBeforeSendHeaders(beforeSendHeadersHandler);
}
