
const { Window } = require('./api/window');
import { cachedFetch } from './cached_resource_fetcher';
const { normalizePreloadScripts } =  require('./convert_options');
import { Identity, PreloadScript } from '../shapes';
import { readFile } from 'fs';
import { writeToLog } from './log';
import * as coreState from './core_state';

interface PreloadScriptWithContent extends PreloadScript {
    _content: string;
}

export interface DownloadResult {
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

        cachedFetch(identity, url, (error, scriptPath) => {
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
