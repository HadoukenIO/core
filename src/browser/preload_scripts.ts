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
import { cachedFetch, FetchResponse } from './cached_resource_fetcher';
import * as log from './log';
import { Identity } from '../shapes';
import ofEvents from './of_events';
import route from '../common/route';
import { Timer } from '../common/timer';


// some local type definitions
interface PreloadFile {
    url: string; // URI actually: http:// or file://
    optional?: boolean; // not used herein but used by Application.getPreloadScripts
}
interface PreloadedScript extends PreloadFile, FetchResponse {
    // PreloadFile Element with FetchResponse properties mixed in
}
type ScriptSet = PreloadedScript[];

// Preload scripts' states are stored here. Example:
// 'http://path.com/to/script': 'load-succeeded'
type PreloadState = string;
interface StatefulPreloadFile extends PreloadFile {
    state: string;
}

// store for windows' fetched preload script sets, just until eval'd
const scriptSetCache: { [key: string]: ScriptSet } = {};

const preloadStates: Map<string, PreloadState> = new Map();

/* Requests all the window's preload scripts.
 * Successfully loaded scripts are saved via `set` before `loadUrl` is called.
 * They are kept in memory only until api-decorator consumes them via `eval`, after which they are released.
 *
 * Per `cachedFetch`, errors are limited to actual transport errors; unexpected server responses are not
 * considered errors. E.g., 404 status does not throw an error; rather `success` is set to false and the
 * `data` property is undefined.
 *
 * Note that errors are caught herein and logged; they are not re-thrown, the
 * rejection is no longer pending, and further catch handlers will never be called.
 * Therefore, the caller if the caller wants to know when the download is complete,
 * only a `.then()` is needed.
 */
export function download(
    identity: Identity,
    preloadOption: PreloadFile[]
): Promise<ScriptSet> {
    const timer = new Timer();
    let allLoaded: Promise<ScriptSet>;

    //convert Promise<FetchResponse>[] to Promise<PreloadScript>[]
    const preloadPromises: Promise<PreloadedScript>[] = preloadOption.map((preloadFile: PreloadFile): Promise<PreloadedScript> => {
        const state: PreloadState = 'load-started';
        const { url } : { url: string } = preloadFile;

        updatePreloadState(identity, preloadFile, state);
        logPreload('info', identity, state, url);

        //convert Promise<FetchResponse> to Promise<PreloadScript>
        return cachedFetch(url).then((fetch: FetchResponse): PreloadedScript => {
            const state: PreloadState = fetch.success ? 'load-succeeded' : 'load-failed';

            updatePreloadState(identity, preloadFile, state);
            logPreload('info', identity, state, url, timer);

            return Object.assign({}, preloadFile, fetch); //mix in: fetch + preload
        });
    });

    // wait for them all to resolve
    allLoaded = Promise.all(preloadPromises);

    allLoaded
        .then(logSummary)
        .then(cache)
        .catch(logError);

    return allLoaded;

    function logSummary(scriptSet: ScriptSet): ScriptSet {
        const compactScriptList = scriptSet.filter((preloadedScript: PreloadedScript) => preloadedScript.success);
        const summary = `${compactScriptList.length} of ${scriptSet.length} scripts`;
        logPreload('info', identity, 'load summary', summary, timer);
        return scriptSet;
    }

   function cache(scriptSet: ScriptSet): ScriptSet {
       set(identity, scriptSet);
       return scriptSet;
   }

   function logError(error: Error | string | number) {
       logPreload('error', identity, 'error', '', error);
   }
}

export function set(identity: Identity, scriptSet: ScriptSet): void {
    scriptSetCache[uniqueWindowKey(identity)] = scriptSet;
}

// Be sure to supply a catch (`get(...).catch(...)`) as `validate` may throw an error
export function get(identity: Identity, preloadOption: PreloadFile[]): Promise<ScriptSet> {
    const scriptSet: ScriptSet = scriptSetCache[uniqueWindowKey(identity)];
    let promisedScriptSet: Promise<ScriptSet>;

    if (scriptSet) {
        // release from memory
        // todo: consider not releasing main window's for reuse by child windows that inherit
        delete scriptSetCache[uniqueWindowKey(identity)];

        // scripts were fully loaded & cached prior to window create
        promisedScriptSet = Promise.resolve(scriptSet);
    } else {
        // scripts missing due to reload or window.open
        promisedScriptSet = download(identity, preloadOption);
    }

    return promisedScriptSet.then(validate);
}

function uniqueWindowKey(identity: Identity): string {
    return route.window('preload', identity.uuid, identity.name);
}

//validate for any missing required script(s) even one of which will preclude running any scripts at all
function validate(scriptSet: ScriptSet): ScriptSet {
    //todo: check this earlier and if any, cancel remaining in-progress downloads which could be sizable
    const missingRequiredScripts: ScriptSet = scriptSet.filter((preloadedScript: PreloadedScript) => {
        const required = !preloadedScript.optional;
        return required && !preloadedScript.success;
    });

    if (missingRequiredScripts.length) {
        const URLs: string[] = missingRequiredScripts.map((missingScript: PreloadedScript)  => missingScript.url);
        const message = `Execution of preload scripts canceled due to missing required script(s) ${URLs}`;
        throw new Error(message);
    }

    return scriptSet;
}

function logPreload(
    level: string,
    identity: Identity,
    state: string,
    url: string,
    timerOrError?: Timer | Error | string | number
): void {
    state = state.replace(/-/g, ' ');

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
    preloadFile: PreloadFile,
    state: PreloadState
): void {
    const { url } : { url: string } = preloadFile;

    const { uuid, name } : { uuid: string, name?: string } = identity;
    const eventRoute = route.window('preload-state-changing', uuid, name);
    const preloadState: StatefulPreloadFile = Object.assign({}, preloadFile, { state });

    preloadStates.set(url, state);
    ofEvents.emit(eventRoute, {name, uuid, preloadState});
}

export const getPreloadScriptState = (url: string): string => {
    return preloadStates.get(url);
};
