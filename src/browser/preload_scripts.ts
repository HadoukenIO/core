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

// built-in modules
import * as fs from 'fs';
import { join } from 'path';

// local modules
import { cachedFetch, FetchResponse } from './cached_resource_fetcher';
import * as log from './log';
import { Identity } from '../shapes';
import ofEvents from './of_events';
import route from '../common/route';
import { rvmMessageBus, PluginQuery } from './rvm/rvm_message_bus';
import { sendToRVM } from './rvm/utils';
import { getConfigUrlByUuid } from './core_state.js';
import { Timer } from '../common/timer';


// some local type definitions
type Preload = PreloadScript | PluginModule;
interface PreloadScript {
    url: string; // URI actually: http:// or file://
    optional?: boolean; // false means required for any script to run (used by Application.getPreloadScripts)
}
interface PluginModule {
    name: string;
    version: string;
    optional?: boolean;
}
type Resolver = (value?: any) => void;
type Rejector = (reason?: Error) => void;

interface Preloaded extends PreloadScript, PluginModule, FetchResponse {
    // Preload with FetchResponse properties mixed in
}
type PreloadFileset = Preloaded[];

// Preload scripts' states are stored here. Example:
// 'http://path.com/to/script': 'load-succeeded'
type PreloadState = string;
interface StatefulPreloadFile extends Preloaded {
    state: string;
}

// store for windows' fetched preload script sets, just until eval'd
const filesetCache: { [key: string]: PreloadFileset } = {};

interface PluginResponse {
    success: boolean;
    identity: Identity;
    filePath: string;
    plugin: PluginModule;
}

const preloadStates: Map<string, PreloadState> = new Map();

/** @summary oad all the window's preload scripts.
 * @desc Successfully loaded scripts are saved via `setPreloadScript` before `loadUrl` is called.
 * They are kept in memory only until api-decorator consumes them via `eval`, after which they are released.
 *
 * Per `cachedFetch`, errors are limited to actual transport errors; unexpected server responses are not
 * considered errors. E.g., 404 status does not throw an error; rather `success` is set to false and the
 * `data` property is undefined.
 *
 * @param {object} identity
 * @param {string|object[]} options
 * @param {function} [proceed] - If supplied, both `then` and `catch` call it.
 *
 * If you don't supply `proceed`, call both `then` and `catch` on your own to proceed as appropriate.
 */

export function download(
    identity: Identity,
    options: { preload?: PreloadScript[], plugin?: PluginModule[] },
    proceed?: () => void
): void {
    const timer = new Timer();
    const preloads: Preload[] = (<Preload[]>(options.preload || [])).concat(<Preload[]>(options.plugin || []));

    // start overlapped downloads
    const preloadPromises: Promise<Preloaded>[] = preloads.map((preload: Preload): Promise<Preloaded> => {
        const toPreloaded : (fetch: FetchResponse | PluginResponse) => Preloaded =
            mixinFetchResults.bind(null, identity, timer, preload);

        updatePreloadState(identity, preload, 'load-started');
        logPreload('info', identity, 'load-started', preload);

        if (isPreloadScript(preload)) {
            return cachedFetch(preload.url).then(toPreloaded);
        } else {
            return fetchPlugin(identity, preload).then(loadPlugin).then(toPreloaded);
        }
    });

    // wait for them all to resolve
    const allLoaded: Promise<PreloadFileset> = Promise.all(preloadPromises);

    allLoaded
        .then((scriptSet: PreloadFileset) => {
            const compactScriptList = scriptSet.filter((preloadFile: Preloaded) => preloadFile.success);
            const summary = `${compactScriptList.length} of ${scriptSet.length} scripts`;

            logPreload('info', identity, 'load summary', summary, timer);

            set(identity, scriptSet);

            if (proceed) {
                proceed();
            }
        })
        .catch((error: Error | string | number) => {
            logPreload('error', identity, 'error', '', error);

            if (proceed) {
                proceed();
            }
        });
}

// resolves to type `PreloadFetched` on success
// resolves to `undefined` when fetch fails to download asset to Chromium cache
function fetchPlugin(identity: Identity, plugin: PluginModule): Promise<PluginResponse> {
    return new Promise((resolve, reject) => {
        const sourceUrl = getConfigUrlByUuid(identity.uuid);
        const msg: PluginQuery = {
            topic: 'application',
            messageId: '1',
            action: 'query-plugin',
            name: plugin.name,
            version: plugin.version,
            optional: plugin.optional,
            sourceUrl
        };

        rvmMessageBus.publish(msg, response => {
            const { payload } = response;
            if (payload.hasOwnProperty('path') && payload.action === 'query-plugin') {
                const filePath = join(payload.path, payload.target);
                resolve({identity, plugin, filePath});
            } else {
                updatePreloadState(identity, plugin, 'load-failed');
                resolve();
            }
        });
    });
}

// resolves to type `PreloadLoaded` on success
// resolves to `undefined` when above fetch failed or when successfully fetched asset fails to load from Chromium cache
function loadPlugin(opts: PluginResponse): FetchResponse {
    let fetchResponse: FetchResponse = { success: false };

    if (opts) {
        const { identity, plugin, filePath }: { identity: Identity, plugin: PluginModule, filePath: string } = opts;

        fs.readFile(filePath, 'utf8', (err: Error, data: string) => {
            if (err) {
                const state: PreloadState = 'load-failed';
                const level: string = plugin.optional ? 'warning' : 'error';

                logPreload(level, identity, state, plugin, err);
                updatePreloadState(identity, plugin, state);
            } else {
                const state: PreloadState = 'load-succeeded';

                logPreload('info', identity, state, plugin);
                updatePreloadState(identity, plugin, state);

                fetchResponse = { success: true, data };
            }
        });
    }

    return fetchResponse;
}

function mixinFetchResults(identity: Identity, timer: Timer, preload: Preload, fetchResponse: FetchResponse) : Preloaded {
    const state: PreloadState = fetchResponse.success ? 'load-succeeded' : 'load-failed';

    updatePreloadState(identity, preload, state);
    logPreload('info', identity, state, preload, timer);

    return Object.assign(<Preloaded>{}, preload, fetchResponse);
}

export function set(identity: Identity, scriptSet: PreloadFileset) {
    const uniqueWindowId = route.window('preload', identity.uuid, identity.name);
    filesetCache[uniqueWindowId] = scriptSet;
}

//Meant to be called one time per window; scripts are deleted from cache so cannot be returned more than once.
export function get(identity: Identity): Promise<PreloadFileset> {
    const uniqueWindowId = route.window('preload', identity.uuid, identity.name);
    const scriptSet: PreloadFileset = filesetCache[uniqueWindowId] || [];

    //release from memory; won't be needed again
    delete filesetCache[uniqueWindowId];

    //any missing required script(s) preclude running any scripts at all
    //todo: check this earlier and if any, cancel remaining in-progress downloads which could be sizable
    const missingRequiredScripts = scriptSet.filter(preloadScript => {
        const required = !preloadScript.optional;
        return required && !preloadScript.success;
    });

    if (missingRequiredScripts.length) {
        const URLs = missingRequiredScripts.map(preloadScript => preloadScript.url);
        const list = JSON.stringify(JSON.stringify(URLs));
        const message = `Execution of preload scripts canceled due to missing required script(s) ${list}`;
        const error = new Error(message);
        return Promise.reject(error);
    }

    return Promise.resolve(scriptSet);
}

function logPreload(
    level: string,
    identity: Identity,
    state: string,
    target: Preload | string,
    timerOrError?: Timer | Error | string | number
): void {
    state = state.replace(/-/g, ' ');

    if (target) {
        if (isPreloadScript(target)) {
            target = `preload script ${getIdentifier(target)}`;
        } else if (isPluginModule(target)) {
            target = `plugin module ${getIdentifier(target)}`;
        }

        state += ` for ${target}`;
    }

    if (timerOrError instanceof Timer) {
        state += timerOrError.toString(' in #.### secs.');
    } else if (timerOrError) {
        state += `: ${JSON.stringify(timerOrError)}`;
    }

    log.writeToLog(level, `[PRELOAD] [${identity.uuid}]-[${identity.name}] ${state}`);
}

function updatePreloadState(
    identity: Identity,
    preload: Preload,
    state: PreloadState
): void {
    const { uuid, name }: Identity = identity;
    const eventRoute = route.window('preload-state-changing', uuid, name);
    const preloadState: StatefulPreloadFile = Object.assign(<Preloaded>{}, preload, { state });

    preloadStates.set(getIdentifier(preload), state);
    ofEvents.emit(eventRoute, {name, uuid, preloadState});
}

export function getPreloadScriptState(identifier: string): string {
    return preloadStates.get(identifier);
}

export function getIdentifier(preload: Preload): string {
    return isPreloadScript(preload) ? preload.url : `${preload.name}@${preload.version}`;
}

function isPreloadScript(preload: any): preload is PreloadScript {
    return typeof preload === 'object' && preload.hasOwnProperty('url');
}

function isPluginModule(preload: any): preload is PreloadScript {
    return typeof preload === 'object' && preload.hasOwnProperty('name') && preload.hasOwnProperty('version');
}
