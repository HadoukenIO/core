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

// local modules
import { System } from './api/system.js';
import {cachedFetch, FetchResponse} from './cached_resource_fetcher';
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
// Preload scripts' states are stored here. Example:
// 'http://path.com/to/script': 'load-succeeded'
const preloadStates = new Map();

const REGEX_FILE_SCHEME = /^file:\/\//i;

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
            return cachedFetch(preload.url).then((dataResponse: FetchResponse) => {
                updatePreloadState(identity, preload, dataResponse.success ? 'load-succeeded' : 'load-failed');
                System.setPreloadScript(preload.url, dataResponse.data);
            });
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
