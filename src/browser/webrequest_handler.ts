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
const {session} = require('electron');
const System = require('./api/system.js').System;

import * as Shapes from '../shapes';

const moduleName: string = 'WebRequestHandlers';  // for logging

// passed to webRequest.onBeforeSendHeaders
interface RequestDetails {
    id: number;
    url: string;
    method: string;
    resourceType: string;
    requestHeaders: any;
}

// passed to callback of webRequest.onBeforeSendHeaders
interface HeadersResponse {
    cancel: boolean;
    requestHeaders?: any;
}

interface AppUuidFilterUrlMap {
    [uuid: string]: Shapes.WebRequestHeaderOption[];  // app UUID => custom header settings
}
const filterMap: AppUuidFilterUrlMap = {};

interface UrlHeaderMap {
    [urlPattern: string]: Shapes.WebRequestHeader[];  // URL pattern => list of headers
}
let headerMap: UrlHeaderMap = {};  // reset for every app started and closed

function beforeSendHeadersHandler(details: RequestDetails, callback: (response: HeadersResponse) => void): void {
    electronApp.vlog(1, `${moduleName}:beforeSendHeadersHandler for ${details.url} to ${details.method}`);
    let headerAdded: boolean = false;
    Object.keys(headerMap).forEach(urlPattern => {
        if (electronApp.matchesURL(details.url, [urlPattern])) {
            const headers: Shapes.WebRequestHeader[] = headerMap[urlPattern];
            for (const item of headers) {
                Object.keys(item).forEach(key => {
                    details.requestHeaders[key] = item[key];
                    electronApp.vlog(1, `${moduleName}:beforeSendHeadersHandler setting ${key} = ${item[key]}`);
                    headerAdded = true;
                });
            }
        }
    });
    if (headerAdded) {
        callback({cancel: false, requestHeaders: details.requestHeaders});
    } else {
        callback({cancel: false});
    }
}

interface AppCreatedEvent {
    topic: string;
    type:  string;
    uuid:  string;
}

function updateHeaderFilter(): void {
    let urls: string[] = [];
    headerMap = {};

    electronApp.vlog(1, `${moduleName}:updateHeaderFilter for ${JSON.stringify(filterMap)}`);

    Object.keys(filterMap).forEach(uuid => {
        const options: Shapes.WebRequestHeaderOption[] = filterMap[uuid];
        for (const opt of options) {
            electronApp.vlog(1, `${moduleName}:updateHeaderFilter2 for ${JSON.stringify(opt)}`);
            urls = urls.concat(opt.urlList);
            for (const url of opt.urlList) {
                if (!headerMap[url]) {
                    headerMap[url] = [];
                }
                headerMap[url] = headerMap[url].concat(opt.headers);
            }
        }
    });
    const filers = {urls: JSON.stringify(urls)};
    electronApp.vlog(1, `${moduleName}:updateHeaderFilter for ${JSON.stringify(filers)} headers ${JSON.stringify(headerMap)}`);
    session.defaultSession.webRequest.onBeforeSendHeaders(filers, beforeSendHeadersHandler);
}

function onAppCreated(event: AppCreatedEvent): void {
    electronApp.vlog(1, `${moduleName}:onAppCreated for ${event.uuid} `);
    const obj: Shapes.AppObj = coreState.getAppObjByUuid(event.uuid);
    if (obj) {
        const options: Shapes.WindowOptions = obj._options;
        if (options.customRequestHeaders) {
            filterMap[event.uuid] = options.customRequestHeaders;
            updateHeaderFilter();
        }
    }
}

function onAppClosed(event: AppCreatedEvent): void {
    electronApp.vlog(1, `${moduleName}:onAppClosed for ${event.uuid} `);
    const obj: Shapes.AppObj = coreState.getAppObjByUuid(event.uuid);
    if (obj) {
        if (filterMap[event.uuid]) {
            delete filterMap[event.uuid];
            updateHeaderFilter();
        }
    }
}

/**
 * Initialize web request handlers
 */
export function initHandlers(): void {
    electronApp.vlog(1, `init ${moduleName}`);

    // listen to started and closed so custom header map can be reset
    System.addEventListener('application-created', onAppCreated);
    System.addEventListener('application-closed', onAppClosed);
}
