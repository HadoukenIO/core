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

// local modules
import { System } from './api/system.js';
import { cachedFetch } from './cached_resource_fetcher';
import * as log from './log';
import { Identity } from '../shapes';
import ofEvents from './of_events';
import route from '../common/route';
import { rvmMessageBus, PluginQuery } from './rvm/rvm_message_bus';


// some local type definitions
type PreloadOption = PreloadInstance[];
type PreloadInstance = PreloadScript | PreloadPlugin;
interface PreloadScript {
    url: string; // URI actually: http:// or file://
    optional?: boolean; // not used herein but used by api_decorator at script execution time
}
interface PreloadPlugin {
    name: string;
    version: string;
    optional?: boolean;
}
interface PreloadFetched extends PreloadScript {
    scriptPath: string; // location on disc of cached fetch
}
type FetchResolver = (value?: PreloadInstance | PreloadFetched | FetchResponse) => void;
type Resolver = (value?: any) => void;
type Rejector = (reason?: Error) => void;

// Preload scripts' states are stored here. Example:
// 'http://path.com/to/script': 'load-succeeded'
const preloadStates = new Map();

const REGEX_FILE_SCHEME = /^file:\/\//i;

interface FetchResponse {
    identity: Identity;
    preloadScript: PreloadInstance;
    scriptPath: string;
}

/** Returns a `Promise` once all preload scripts have been fetched and loaded or have failed to fetch or load.
 *
 * @param {object} identity
 * @param {string|object[]} preloadOption
 * @param {function} [proceed] - If supplied, both `catch` and `then` are called on it.
 *
 * If you don't supply `proceed`, call both `catch` and `then` on your own to proceed as appropriate.
 *
 * Notes:
 * 4. There is only one `catch`able error, bad preload option type, which has already been logged for you.
 * 1. The promise otherwise always resolves; fetch/load failures are not errors.
 * 2. Successfully loaded scripts are cached via `System.setPreloadScript`,
 * to be eval'd later by api_decorator as windows spin up.
 * 3. No resolve values are available to `then`; to access loaded scripts,
 * call `System.getPreloadScript` or `System.getSelectedPreloadScripts`.
 */

export function fetchAndLoadPreloadScripts(
    identity: Identity,
    preloadOption: PreloadOption,
    proceed?: () => void
): Promise<undefined> {
    log.writeToLog(1, '**** it is reaching the fetchAndLoadPreloadScripts function', true);
    let allLoaded: Promise<undefined>;

    // convert legacy `preloadOption` option into modern `preloadOption` option
    if (typeof preloadOption === 'string') {
        preloadOption = [<PreloadInstance>{ url: preloadOption }];
    }

    log.writeToLog(1, `**** preloadOption: ${JSON.stringify(preloadOption, undefined, 4)}`, true);

    if (!isPreloadOption(preloadOption)) {
        const message = 'Expected `preload` option to be a string primitive OR an array of objects with `url` props.';
        const err = new Error(message);
        allLoaded = Promise.reject(err);
    } else {
        log.writeToLog(1, '**** fetchAndLoadPreloadScripts else statement entered', true);
        const loadedScripts: Promise<undefined>[] = preloadOption.map((preload: PreloadInstance) => {
            log.writeToLog(1, '**** fetchAndLoadPreloadScripts map', true);
            updatePreloadState(identity, preload, 'load-started');

            // following if clause avoids re-fetch for resources already in memory
            // todo: following if clause slated for removal (RUN-3227, blocked by RUN-3162)
            if (
                !REGEX_FILE_SCHEME.test(getIdentifier(preload)) && // except when resource does NOT use "file" scheme...
                System.getPreloadScript(getIdentifier(preload))   // ...is resource already in memory?
            ) {
                // previously downloaded
                log.writeToLog(1, '**** registering as previously downloaded', true);
                updatePreloadState(identity, preload, 'load-succeeded');
                return Promise.resolve();
            } else {
                // not previously downloaded *OR* previous downloaded failed
                log.writeToLog(1, '**** it is reaching the fetch functions', true);
                if (isPreloadScript(preload)) {
                    return fetchScript(identity, preload).then(load);
                } else {
                    return fetchPlugin(identity, preload).then(load);
                }
            }
        });

        // wait for them all to resolve
        allLoaded = Promise.all(loadedScripts);
    }

    allLoaded.catch(err => {
        log.writeToLog(1, '**** allLoaded catch error: ', true);
        log.writeToLog(1, err, true);
    });

    if (proceed) {
        allLoaded.catch(proceed).then(proceed);
    }

    return allLoaded;
}

// resolves to type `PreloadFetched` on success
// resolves to `undefined` when fetch fails to download asset to Chromium cache
function fetchScript(identity: Identity, preloadScript: PreloadInstance): Promise<FetchResponse> {
    return new Promise((resolve: FetchResolver, reject: Rejector) => {
        cachedFetch(identity.uuid, getIdentifier(preloadScript), (fetchError: null | Error, scriptPath: string | undefined) => {
            if (!fetchError) {
                resolve({identity, preloadScript, scriptPath});
            } else {
                updatePreloadState(identity, preloadScript, 'load-failed');
                resolve();
            }
        });
    });
}

// resolves to type `PreloadFetched` on success
// resolves to `undefined` when fetch fails to download asset to Chromium cache
function fetchPlugin(identity: Identity, preloadPlugin: PreloadPlugin): Promise<FetchResponse> {
    log.writeToLog(1, '**** it is reaching fetchPlugin', true);
    return new Promise((resolve, reject) => {
        // TODO: cache it somewhere? -> or is the rvm caching it? (cachedFetch)
        const msg: PluginQuery = {
            topic: 'application',
            action: 'query-plugin',
            payload: preloadPlugin,
            messageId: '1'
        };

        rvmMessageBus.publish(msg, (dataObj) => {
            log.writeToLog(1, `**** RVM message callback ${JSON.stringify(dataObj, undefined, 4)}`, true);
            if (dataObj.payload.hasOwnProperty('path') && dataObj.action === 'query-plugin') {
                const pluginPath = dataObj.payload.path; // dataObj.payload.target?
                resolve({identity, preloadPlugin, pluginPath});
            } else {
                updatePreloadState(identity, preloadPlugin, 'load-failed');
                resolve();
            }
        });
    });
}

// resolves to type `PreloadLoaded` on success
// resolves to `undefined` when above fetch failed or when successfully fetched asset fails to load from Chromium cache
function load(opts: FetchResponse): Promise<undefined> {
    return new Promise((resolve: Resolver, reject: Rejector) => {
        if (!opts || !opts.scriptPath) {
            resolve(); // got fetchError above OR no error but no scriptPath either; in any case don't attempt to load
        } else {
            const {identity, preloadScript, scriptPath} = opts;

            fs.readFile(scriptPath, 'utf8', (readError: null | Error, scriptText: string | undefined) => {

                // todo: remove following workaround when RUN-3162 issue fixed
                //BEGIN WORKAROUND (RUN-3162 fetchError null on 404)
                if (!readError && /^(Cannot GET |<\?xml)/.test(scriptText)) {
                    // got a 404 but response was cached as a file
                    updatePreloadState(identity, preloadScript, 'load-failed');
                    resolve();
                    return;
                }
                //END WORKAROUND

                if (!readError) {
                    updatePreloadState(identity, preloadScript, 'load-succeeded');
                    System.setPreloadScript(getIdentifier(preloadScript), scriptText);
                } else {
                    updatePreloadState(identity, preloadScript, 'load-failed');
                }

                resolve();
            });
        }
    });
}


// type guard: array of Preload objects
function isPreloadOption(preloadOption: PreloadOption): preloadOption is PreloadOption {
    log.writeToLog(1, '**** Checks if isPreloadOption', true);
    log.writeToLog(1, `**** preloadOption: ${JSON.stringify(preloadOption, undefined, 4)}`, true);
    return (
        preloadOption &&
        Array.isArray(preloadOption) &&
        preloadOption.every(isPreloadInstance)
    );
}

// type guard: a Preload object
function isPreloadInstance(preload: PreloadInstance): preload is PreloadInstance {
    log.writeToLog(1, '**** Checks if isPreloadInstance', true);
    return (
        typeof preload === 'object' && typeof getIdentifier(preload) === 'string'
    );
}

function isPreloadScript(preload: any): preload is PreloadScript {
    return (
        typeof preload === 'object' && preload.hasOwnProperty('url')
    );
}

const updatePreloadState = (identity: Identity, preloadScript: PreloadInstance, state: string): void => {
    const {uuid, name} = identity;
    const eventRoute = route.window('preload-state-changing', uuid, name);
    const preloadState = Object.assign({}, preloadScript, {state});

    preloadStates.set(getIdentifier(preloadScript), state);

    ofEvents.emit(eventRoute, {name, uuid, preloadState});
};

export const getPreloadScriptState = (url: string): string => {
    return preloadStates.get(url);
};

function getIdentifier(preload: any) {
    return preload.url ? preload.url : preload.name;
}
