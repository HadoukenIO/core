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
import { Timer } from '../common/timer';


// some local type definitions
type PreloadOption = PreloadInstance[];
interface PreloadInstance {
    url: string; // URI actually: http:// or file://
    optional?: boolean; // not used herein but used by api_decorator at script execution time
}
type FetchResolver = (value?: FetchResponse) => void;
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

type LoadResponses = boolean[];

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
): Promise<LoadResponses> {
    const timer = new Timer();
    let result: Promise<LoadResponses>;

    if (!preloadOption) {
        preloadOption = [];
    } else if (typeof preloadOption === 'string') {
        // convert legacy `preloadOption` option into modern `preloadOption` option
        preloadOption = [<PreloadInstance>{ url: preloadOption }];
    }

    if (!isPreloadOption(preloadOption)) {
        const message = 'Expected `preload` option to be a string primitive OR an array of objects with `url` props.';
        const err = new Error(message);
        result = Promise.reject(err);
    } else {
        const loadedScripts: Promise<undefined>[] = preloadOption.map((preload: PreloadInstance) => {
            // following if clause avoids re-fetch for remote resources already in memory
            // todo: following if clause slated for removal (RUN-3227, blocked by RUN-3162), i.e., return always
            if (
                !REGEX_FILE_SCHEME.test(preload.url) && // not a local file AND...
                System.getPreloadScript(preload.url)   // ...is already in memory?
            ) {
                // previously downloaded
                logPreload('info', identity, 'previously cached:', preload.url);
                updatePreloadState(identity, preload, 'load-succeeded');
                return Promise.resolve(true);
            } else {
                // not previously downloaded *OR* previous downloaded failed
                return fetchToCache(identity, preload).then(loadFromCache);
            }
        });

        // wait for them all to resolve
        result = Promise.all(loadedScripts);
    }

    result.catch((error: Error | string) => {
        logPreload('error', identity, 'error', '', error);
        return error;
    }).then((values: LoadResponses) => {
        const compact = values.filter(b => b);
        logPreload('info', identity, 'summary: fetch/load',  `${compact.length} of ${values.length} scripts`, timer);
        return values;
    });

    if (proceed) {
        result.catch(proceed).then(proceed);
    }

    return result;
}


// resolves to type `PreloadFetched` on success
// resolves to `undefined` when fetch fails to cache the asset
function fetchToCache(identity: Identity, preloadScript: PreloadInstance): Promise<FetchResponse> {
    const timer = new Timer();
    const { url } = preloadScript;

    logPreload('info', identity, 'fetch started', url);
    updatePreloadState(identity, preloadScript, 'load-started');

    return new Promise((resolve: FetchResolver, reject: Rejector) => {
        cachedFetch(identity.uuid, url, (fetchError: Error, scriptPath: string) => {
            if (!fetchError) {
                logPreload('info', identity, 'fetch succeeded', url, timer);
                resolve({identity, preloadScript, scriptPath});
            } else {
                logPreload(preloadScript.optional ? 'warning' : 'error', identity, 'fetch failed', url, fetchError);
                updatePreloadState(identity, preloadScript, 'load-failed');
                resolve();
            }
        });
    });
}

function loadFromCache(opts: FetchResponse): Promise<boolean> {
    return new Promise((resolve: Resolver, reject: Rejector) => {
        if (!opts || !opts.scriptPath) {
            resolve(false); // got fetchError above OR no error but no scriptPath either; in any case don't attempt to load
        } else {
            const { identity, preloadScript, preloadScript: { url }, scriptPath } = opts;

            logPreload('info', identity, 'load started', url);
            updatePreloadState(identity, preloadScript, 'load-started');

            fs.readFile(scriptPath, 'utf8', (readError: Error, scriptText: string) => {
                // todo: remove following workaround when RUN-3162 issue fixed
                //BEGIN WORKAROUND (RUN-3162 fetchError null on 404)
                if (!readError && /^(Cannot GET |<\?xml)/.test(scriptText)) {
                    // got a 404 but response was cached as a
                    logPreload(preloadScript.optional ? 'warning' : 'error', identity, 'load failed', url, 404);
                    updatePreloadState(identity, preloadScript, 'load-failed');
                    resolve(false);
                    return;
                }
                //END WORKAROUND

                if (!readError) {
                    logPreload('info', identity, 'load succeeded', url);
                    updatePreloadState(identity, preloadScript, 'load-succeeded');
                    System.setPreloadScript(preloadScript.url, scriptText);
                } else {
                    logPreload(preloadScript.optional ? 'warning' : 'error', identity, 'load failed', url, readError);
                    updatePreloadState(identity, preloadScript, 'load-failed');
                }

                resolve(!readError);
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

function logPreload(
    level: string,
    identity: Identity,
    state: string,
    url: string,
    timerOrError?: Timer | Error | string | number
): void {
    if (url) {
        state += ` for ${url}`;
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
    preloadScript: PreloadInstance,
    state?: string
): void {
    const { url } = preloadScript;

    const { uuid, name } = identity;
    const eventRoute = route.window('preload-state-changing', uuid, name);
    const preloadState = Object.assign({}, preloadScript, { state });

    preloadStates.set(url, state);
    ofEvents.emit(eventRoute, {name, uuid, preloadState});
}

export const getPreloadScriptState = (url: string): string => {
    return preloadStates.get(url);
};
