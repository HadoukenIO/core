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

/** @summary oad all the window's preload scripts.
 * @desc Successfully loaded scripts are saved via `setPreloadScript` before `loadUrl` is called.
 * They are kept in memory only until api-decorator consumes them via `eval`, after which they are released.
 *
 * Per `cachedFetch`, errors are limited to actual transport errors; unexpected server responses are not
 * considered errors. E.g., 404 status does not throw an error; rather `success` is set to false and the
 * `data` property is undefined.
 *
 * @param {object} identity
 * @param {string|object[]} preloadOption
 * @param {function} [proceed] - If supplied, both `then` and `catch` call it.
 *
 * If you don't supply `proceed`, call both `then` and `catch` on your own to proceed as appropriate.
 */

export function download(
    identity: Identity,
    preloadOption: PreloadFile[],
    proceed?: () => void
) {
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
        .then((scriptSet: ScriptSet) => {
            const compactScriptList = scriptSet.filter((preloadedScript: PreloadedScript) => preloadedScript.success);
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

export function set(identity: Identity, scriptSet: ScriptSet) {
    const uniqueWindowId = route.window('preload', identity.uuid, identity.name);
    scriptSetCache[uniqueWindowId] = scriptSet;
}

//Meant to be called one time per window; scripts are deleted from cache so cannot be returned more than once.
export function get(identity: Identity): Promise<ScriptSet> {
    const uniqueWindowId = route.window('preload', identity.uuid, identity.name);
    const scriptSet: ScriptSet = scriptSetCache[uniqueWindowId] || [];

    //release from memory; won't be needed again
    delete scriptSetCache[uniqueWindowId];

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
