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
type PreloadInstance = PreloadScript;
interface PreloadScript {
    url: string; // URI actually: http:// or file://
    optional?: boolean; // not used herein but used by api_decorator at script execution time
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
    preloadScript?: PreloadInstance;
    scriptPath: string;
}

type LoadResponses = boolean[];

/** Returns a `Promise` once all preload scripts have been fetched and loaded or have failed to fetch or load.
 *
 * @param {object} identity
 * @param {PreloadInstance[]} preloadOption
 * @param {function} [proceed] - If supplied, both `catch` and `then` are called on it.
 *
 * If you don't supply `proceed`, call both `catch` and `then` on your own to proceed as appropriate.
 *
 * Notes:
 * 1. There is only one `catch`able error, bad preload option type, which has already been logged for you.
 * 2. The promise otherwise always resolves; fetch/load failures are not errors.
 * 3. Successfully loaded scripts are cached via `System.setPreloadScript`,
 * to be eval'd later by api_decorator as windows spin up.
 * 4. No resolve values are available to `then`; to access loaded scripts,
 * call `System.getPreloadScript` or `System.getSelectedPreloadScripts`.
 */

export function fetchAndLoadPreloadScripts(
    identity: Identity,
    preloadOption: PreloadOption,
    proceed?: () => void
): Promise<LoadResponses> {
    const timer = new Timer();
    let result: Promise<LoadResponses>;

    const loadedScripts: Promise<any>[] = preloadOption.map((preload: PreloadInstance) => {
        // following if clause avoids re-fetch for remote resources already in memory
        // todo: following if clause slated for removal (RUN-3227, blocked by RUN-3162), i.e., return always
        if (
            !REGEX_FILE_SCHEME.test(getIdentifier(preload)) && // not a local file AND...
            System.getPreloadScript(getIdentifier(preload))   // ...is already in memory?
        ) {
            // previously downloaded
            logPreload('info', identity, 'previously cached:', getIdentifier(preload));
            updatePreloadState(identity, preload, 'load-succeeded');
            return Promise.resolve(true);
        } else {
            // not previously downloaded *OR* previous downloaded failed
            return fetchToCache(identity, preload).then(loadFromCache);
        }
    });

    // wait for them all to resolve
    result = Promise.all(loadedScripts);

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
function fetchToCache(identity: Identity, preloadScript: PreloadScript): Promise<FetchResponse> {
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

// resolves to type `PreloadLoaded` on success
// resolves to `undefined` when above fetch failed or when successfully fetched asset fails to load from Chromium cache
function loadFromCache(opts: FetchResponse): Promise<boolean> {
    return new Promise((resolve: Resolver, reject: Rejector) => {
        if (!opts || !opts.scriptPath) {
            resolve(false); // got fetchError above OR no error but no scriptPath either; in any case don't attempt to load
        } else {
            const preload = opts.preloadScript;
            const { identity, scriptPath } = opts;
            const id = getIdentifier(preload);

            logPreload('info', identity, 'load started', id);
            updatePreloadState(identity, preload, 'load-started');

            fs.readFile(scriptPath, 'utf8', (readError: Error, scriptText: string) => {
                // todo: remove following workaround when RUN-3162 issue fixed
                //BEGIN WORKAROUND (RUN-3162 fetchError null on 404)
                if (!readError && /^(Cannot GET |<\?xml)/.test(scriptText)) {
                    // got a 404 but response was cached as a
                    logPreload(isOptional(preload) ? 'warning' : 'error', identity, 'load failed', id, 404);
                    updatePreloadState(identity, preload, 'load-failed');
                    resolve(false);
                    return;
                }
                //END WORKAROUND

                if (!readError) {
                    logPreload('info', identity, 'load succeeded', id);
                    updatePreloadState(identity, preload, 'load-succeeded');
                    System.setPreloadScript(getIdentifier(preload), scriptText);
                } else {
                    logPreload(isOptional(preload) ? 'warning' : 'error', identity, 'load failed', id, readError);
                    updatePreloadState(identity, preload, 'load-failed');
                }

                resolve(!readError);
            });
        }
    });
}

function logPreload(
    level: string,
    identity: Identity,
    state: string,
    id: string,
    timerOrError?: Timer | Error | string | number
): void {
    if (id) {
        state += ` for ${id}`;
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
    preload: PreloadInstance,
    state?: string
): void {
    const id = getIdentifier(preload);

    const { uuid, name } = identity;
    const eventRoute = route.window('preload-state-changing', uuid, name);
    const preloadState = Object.assign({}, preload, { state });

    preloadStates.set(id, state);
    ofEvents.emit(eventRoute, {name, uuid, preloadState});
}

function isPreloadOption(preloadOption: PreloadOption): preloadOption is PreloadOption {
    return (
        preloadOption &&
        Array.isArray(preloadOption) &&
        preloadOption.every(isPreloadInstance)
    );
}

// type guard: a Preload object
function isPreloadInstance(preload: PreloadInstance): preload is PreloadInstance {
    return (
        typeof preload === 'object' && typeof getIdentifier(preload) === 'string'
    );
}

export function getPreloadScriptState(identifier: string): string {
    return preloadStates.get(identifier);
}

export function getIdentifier(preload: any) {
    return preload.url ? preload.url : `${preload.name}-${preload.version}`;
}

function isOptional(preload: any) {
    return preload.optional;
}
