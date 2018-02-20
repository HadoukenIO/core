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

const Window = require('./api/window.js').Window;
import { cachedFetch } from './cached_resource_fetcher';
import { normalizePreloadScripts } from './convert_options';
import { Identity, PreloadScript } from '../shapes';
import { readFile } from 'fs';
import { writeToLog } from './log';
import * as coreState from './core_state';

interface PreloadScriptWithContent extends PreloadScript {
    _content: string;
}

interface DownloadResult {
    url: string;
    success: boolean;
    error?: string;
}

/**
 * A map of local paths to preload scripts that
 * have already been downloaded (per app).
 *
 * Examples:
 * 'appUuid preloadScriptURL' -> 'path\to\preload\script.js'
 * 'appUuid preloadScriptURL' -> '' (empty path means load failed)
 */
const pathMap: Map<string, string> = new Map();

const getKey = (uuid: string, url: string): string => `${uuid} ${url}`;

export async function downloadScripts(identity: Identity, preloadScripts: PreloadScript[] = []): Promise<DownloadResult[]> {
    const promises = preloadScripts.map((preloadScript) => {
        return downloadScript(identity, preloadScript);
    });
    return await Promise.all(promises);
}

function downloadScript(identity: Identity, preloadScript: PreloadScript): Promise<DownloadResult> {
    return new Promise((resolve) => {
        const { uuid, name } = identity;
        const { url } = preloadScript;
        const pathMapKey = getKey(uuid, url);
        const log = (msg: string) => {
            writeToLog('info', `[preloadScripts] [${uuid}]-[${name}]: ${msg}`);
        };

        log(`Started downloading preload script from URL [${url}]`);

        cachedFetch(uuid, url, (error, scriptPath) => {
            const result: DownloadResult = { url, success: !error };

            if (error) {
                pathMap.set(pathMapKey, '');
                log(`Failed downloading preload script from URL [${url}]: ${error}`);
                result.error = error.toString();
            } else {
                pathMap.set(pathMapKey, scriptPath);
                log(`Succeeded downloading preload script from URL [${url}]`);
            }

            resolve(result);
        });
    });
}

export async function loadScripts(identity: Identity): Promise<PreloadScriptWithContent[]|any> {
    let options;
    const frameInfo = coreState.getInfoByUuidFrame(identity);
    if (frameInfo && frameInfo.entityType === 'iframe') {
        options = Window.getOptions({uuid: frameInfo.parent.uuid, name: frameInfo.parent.name});
    } else {
        options = Window.getOptions(identity);
    }
    const preloadScripts = normalizePreloadScripts(options);
    const promises = preloadScripts.map((preloadScript: PreloadScript) => loadScript(identity, preloadScript));
    return await Promise.all(promises);
}

function loadScript(identity: Identity, preloadScript: PreloadScript): Promise<PreloadScriptWithContent> {
    return new Promise((resolve) => {
        const { uuid, name } = identity;
        const { url } = preloadScript;
        const pathMapKey = getKey(uuid, url);
        const scriptPath = pathMap.get(pathMapKey);
        const log = (msg: string) => {
            writeToLog('info', `[preloadScripts] [${uuid}]-[${name}]: ${msg}`);
        };

        log(`Started loading preload script for URL [${url}]`);
        Window.setWindowPreloadState(identity, {...preloadScript, state: 'load-started'});

        if (!scriptPath) {
            log(`Failed loading preload script for URL [${url}]: preload script wasn't downloaded`);
            Window.setWindowPreloadState(identity, {...preloadScript, state: 'load-failed'});
            return resolve({...preloadScript, _content: ''});
        }

        readFile(scriptPath, 'utf8', (readError: Error, data: string) => {
            if (readError) {
                log(`Failed loading preload script for URL [${url}] from path [${scriptPath}]: ${readError}`);
                Window.setWindowPreloadState(identity, {...preloadScript, state: 'load-failed'});
                resolve({...preloadScript, _content: ''});
            } else {
                log(`Succeeded loading preload script for URL [${url}] from path [${scriptPath}]`);
                Window.setWindowPreloadState(identity, {...preloadScript, state: 'load-succeeded'});
                resolve({...preloadScript, _content: data});
            }
        });
    });
}
