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

interface File extends PreloadScript, PluginModule, FetchResponse {
    // Preload with FetchResponse properties mixed in
}
type Fileset = File[];

// store for windows' fetched preload script and plugin module files, just until eval'd
const cache: { [key: string]: Fileset } = {};

interface PluginResponse {
    success: boolean;
    identity: Identity;
    filePath: string;
    plugin: PluginModule;
}

// Preload scripts' states are stored here. Example:
// 'http://path.com/to/script': 'load-succeeded'
type PreloadState = string;
interface StatefulPreloadFile extends File {
    state: string;
}

const preloadStates: Map<string, PreloadState> = new Map();

/* Requests all the window's preload scripts.
 * Successfully loaded scripts are saved via `set` before `loadUrl` is called.
 * They are kept in memory only until api-decorator consumes them via `eval`, after which they are released.
 *
 * The `preload` parameter may be either:
 * 1. a single array OR
 * 2. a nested array containing: `preload` array and/or `plugin` array and/or undefined
 *
 * Errors are caught herein and logged; the caller does not need to call .catch().
 * Per `cachedFetch`, errors are limited to actual transport errors; unexpected server responses are not
 * considered errors. E.g., 404 status does not throw an error; rather `success` is set to false and the
 * `data` property is undefined.
 */
export function download(
    identity: Identity,
    preloads: Preload[]
): Promise<Fileset> {
    const timer = new Timer();

    preloads = concat(preloads);

    // start overlapped downloads
    const filePromises: Promise<File>[] = preloads.map((preload: Preload): Promise<File> => {
        const toPreloaded : (fetch: FetchResponse | PluginResponse) => File =
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
    const allLoaded: Promise<Fileset> = Promise.all(filePromises);

    allLoaded
        .then(logSummary)
        .then(cacheLoadedFileset)
        .catch(logError);

    return allLoaded;

    function logSummary(fileset: Fileset): Fileset {
        const scripts: Fileset = fileset.filter(isPreloadScript);
        const loadedScripts: Fileset = scripts.filter((file: File) => file.success);

        const plugins: Fileset = fileset.filter(isPluginModule);
        const loadedPlugins: Fileset = plugins.filter((file: File) => file.success);

        const summary: string[] = [];
        if (scripts.length) { summary.push(`${loadedScripts.length} of ${scripts.length} scripts`); }
        if (plugins.length) { summary.push(`${loadedPlugins.length} of ${plugins.length} plugins`); }

        const jointSummary = summary.join(' and ');
        logPreload('info', identity, 'load summary', jointSummary, timer);

        return fileset;
    }

    function cacheLoadedFileset(fileset: Fileset): Fileset {
        set(identity, fileset);
        return fileset;
    }

    function logError(error: Error | string | number) {
        logPreload('error', identity, 'error', '', error);
    }
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

function mixinFetchResults(identity: Identity, timer: Timer, preload: Preload, fetchResponse: FetchResponse) : File {
    const state: PreloadState = fetchResponse.success ? 'load-succeeded' : 'load-failed';

    updatePreloadState(identity, preload, state);
    logPreload('info', identity, state, preload, timer);

    return Object.assign(<File>{}, preload, fetchResponse);
}

function concat(...preloads: any[]): Preload[] {
    // concatenates multiple arrays into a single array and filters out undefined
    return Array.prototype.concat.apply([], preloads).filter((preload: Preload) => preload);
}

function set(identity: Identity, fileSet: Fileset) {
    cache[uniqueWindowKey(identity)] = fileSet;
}

// Be sure to supply a catch (`get(...).catch(...)`) as `validate` may throw an error
export function get(identity: Identity, preloads: Preload[]): Promise<Fileset> {
    const fileset: Fileset = cache[uniqueWindowKey(identity)];
    let promisedScriptSet: Promise<Fileset>;

    if (fileset) {
        // release from memory
        // todo: consider not releasing main window's for reuse by child windows that inherit
        delete cache[uniqueWindowKey(identity)];

        // scripts were fully loaded & cached prior to window create
        promisedScriptSet = Promise.resolve(fileset);
    } else {
        // scripts missing due to reload or window.open
        promisedScriptSet = download(identity, preloads);
    }

    return promisedScriptSet.then(validate);
}

function uniqueWindowKey(identity: Identity): string {
    return route.window('preload', identity.uuid, identity.name);
}

//validate for any missing required script(s) even one of which will preclude running any scripts at all
function validate(fileset: Fileset): Fileset {
    //todo: check this earlier and if any, cancel remaining in-progress downloads which could be sizable
    const missingRequiredFiles: Fileset = fileset.filter((file: File) => {
        return isPreloadScript(file) && !file.optional && !file.success;
    });

    if (missingRequiredFiles.length) {
        const IDs: string[] = missingRequiredFiles.map(getIdentifier);
        const message = `Execution of preload scripts and plugin modules canceled due to missing required resource(s) ${IDs}`;
        throw new Error(message);
    }

    return fileset;
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
    const preloadState: StatefulPreloadFile = Object.assign(<File>{}, preload, { state });

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
