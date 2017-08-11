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


// some local type definitions
type PreloadOption = PreloadInstance[];
interface PreloadInstance {
    url: string; // URI actually: http:// or file://
    optional?: boolean; // not used herein but used by api_decorator at script execution time
}
interface PreloadFetched extends PreloadInstance {
    scriptPath: string; // location on disc of cached fetch
}
type FetchResolver = (value?: PreloadInstance | PreloadFetched | FetchResponse) => void;
type Resolver = (value?: any) => void;
type Rejector = (reason?: Error) => void;

// Preload scripts' states are stored here. Example:
// 'http://path.com/to/script': 'load-succeeded'
const preloadStates = new Map();

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
    let allLoaded: Promise<undefined>;

    // convert legacy `preloadOption` option into modern `preloadOption` option
    if (typeof preloadOption === 'string') {
        preloadOption = [<PreloadInstance>{ url: preloadOption }];
    }

    if (!isPreloadOption(preloadOption)) {
        const message = 'Expected `preload` option to be a string primitive OR an array of objects with `url` props.';
        const err = new Error(message);
        allLoaded = Promise.reject(err);
    } else {
        const loadedScripts: Promise<undefined>[] = preloadOption.map((preload: PreloadInstance) => {
            updatePreloadState(identity, preload, 'load-started');

            if (System.getPreloadScript(preload.url)) {
                // previously downloaded
                updatePreloadState(identity, preload, 'load-succeeded');
                return Promise.resolve();
            } else {
                // not previously downloaded *OR* previous downloaded failed
                return fetch(identity, preload).then(load);
            }
        });

        // wait for them all to resolve
        allLoaded = Promise.all(loadedScripts);
    }

    allLoaded.catch(err => {
        log.writeToLog(1, err, true);
    });

    if (proceed) {
        allLoaded.catch(proceed).then(proceed);
    }

    return allLoaded;
}


// resolves to type `PreloadFetched` on success
// resolves to `undefined` when fetch fails to download asset to Chromium cache
function fetch(identity: Identity, preloadScript: PreloadInstance): Promise<FetchResponse> {
    return new Promise((resolve: FetchResolver, reject: Rejector) => {
        cachedFetch(identity.uuid, preloadScript.url, (fetchError: null | Error, scriptPath: string | undefined) => {
            if (!fetchError) {
                resolve({identity, preloadScript, scriptPath});
            } else {
                updatePreloadState(identity, preloadScript, 'load-failed');
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
                    System.setPreloadScript(preloadScript.url, scriptText);
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
    return (
        preloadOption &&
        Array.isArray(preloadOption) &&
        preloadOption.every(isPreloadScript)
    );
}

// type guard: a Preload object
function isPreloadScript(preloadScript: PreloadInstance): preloadScript is PreloadInstance {
    return (
        typeof preloadScript === 'object' &&
        typeof preloadScript.url === 'string'
    );
}

const updatePreloadState = (identity: Identity, preloadScript: PreloadInstance, state: string): void => {
    const {uuid, name} = identity;
    const eventRoute = route.window('preload-state-changing', uuid, name);
    const preloadState = Object.assign({}, preloadScript, {state});

    preloadStates.set(preloadScript.url, state);

    ofEvents.emit(eventRoute, {name, uuid, preloadState});
};

export const getPreloadScriptState = (url: string): string => {
    return preloadStates.get(url);
};
