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
import { convertToElectron } from './convert_options';
import { Identity, PreloadScript } from '../shapes';
import { readFile } from 'fs';
import { writeToLog } from './log';

interface PreloadScriptWithContent extends PreloadScript {
    _content: string;
}

export async function downloadScripts(identity: Identity, preloadScripts: PreloadScript[] = []): Promise<undefined[]> {
    const promises = preloadScripts.map((preloadScript) => {
        return downloadScript(identity, preloadScript);
    });
    return await Promise.all(promises);
}

function downloadScript(identity: Identity, preloadScript: PreloadScript): Promise<undefined> {
    return new Promise((resolve) => {
        const { uuid, name } = identity;
        const { url } = preloadScript;
        const log = (msg: string) => {
            writeToLog('info', `[preloadScripts] [${uuid}]-[${name}]: ${msg}`);
        };

        log(`Started downloading preload script from URL [${url}]`);

        cachedFetch(uuid, url, (error) => {
            if (error) {
                log(`Failed downloading preload script from URL [${url}]: ${error}`);
            } else {
                log(`Succeeded downloading preload script from URL [${url}]`);
            }

            resolve();
        });
    });
}

export async function loadScripts(identity: Identity): Promise<PreloadScriptWithContent[]|any> {
    const options = Window.getOptions(identity);
    const { preloadScripts } = convertToElectron(options);
    const promises = preloadScripts.map((preloadScript: PreloadScript) => loadScript(identity, preloadScript));
    return await Promise.all(promises);
}

function loadScript(identity: Identity, preloadScript: PreloadScript): Promise<PreloadScriptWithContent> {
    return new Promise((resolve) => {
        const { uuid, name } = identity;
        const { url } = preloadScript;
        const log = (msg: string) => {
            writeToLog('info', `[preloadScripts] [${uuid}]-[${name}]: ${msg}`);
        };

        log(`Started loading preload script for URL [${url}]`);
        Window.setWindowPreloadState(identity, {...preloadScript, state: 'load-started'});

        cachedFetch(uuid, url, (fetchError, scriptPath) => {
            if (fetchError) {
                log(`Failed loading preload script for URL [${url}]: ${fetchError}`);
                Window.setWindowPreloadState(identity, {...preloadScript, state: 'load-failed'});
                return resolve({...preloadScript, _content: ''});
            }

            readFile(scriptPath, 'utf8', (readError: Error, data: string) => {
                if (readError) {
                    log(`Failed loading preload script for URL [${url}]: ${readError}`);
                    Window.setWindowPreloadState(identity, {...preloadScript, state: 'load-failed'});
                    resolve({...preloadScript, _content: ''});
                } else {
                    log(`Succeeded loading preload script for URL [${url}]`);
                    Window.setWindowPreloadState(identity, {...preloadScript, state: 'load-succeeded'});
                    resolve({...preloadScript, _content: data});
                }
            });
        });
    });
}
