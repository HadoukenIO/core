
import { cachedFetch } from './cached_resource_fetcher';
import { normalizePreloadScripts } from './convert_options';
import { Identity, PreloadScript, InjectableContext } from '../shapes';
import { readFile } from 'fs';
import { writeToLog } from './log';
import ofEvents from './of_events';
import route from '../common/route';
import { getInfoByUuidFrame, getRoutingInfoByUuidFrame, getEntityByUuidFrame } from './core_state';

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
    const {uuid, name, ...frameInfo} = getInfoByUuidFrame(identity);
    if (frameInfo && frameInfo.entityType === 'iframe') {
        options = getRoutingInfoByUuidFrame(frameInfo.parent.uuid, frameInfo.parent.name)._options;
    } else {
        options = getRoutingInfoByUuidFrame(uuid, name)._options;
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
        setWindowPreloadState(identity, {...preloadScript, state: 'load-started'});

        if (!scriptPath) {
            log(`Failed loading preload script for URL [${url}]: preload script wasn't downloaded`);
            setWindowPreloadState(identity, {...preloadScript, state: 'load-failed'});
            return resolve({...preloadScript, _content: ''});
        }

        readFile(scriptPath, 'utf8', (readError: Error, data: string) => {
            if (readError) {
                log(`Failed loading preload script for URL [${url}] from path [${scriptPath}]: ${readError}`);
                setWindowPreloadState(identity, {...preloadScript, state: 'load-failed'});
                resolve({...preloadScript, _content: ''});
            } else {
                log(`Succeeded loading preload script for URL [${url}] from path [${scriptPath}]`);
                setWindowPreloadState(identity, {...preloadScript, state: 'load-succeeded'});
                resolve({...preloadScript, _content: data});
            }
        });
    });
}
export function setWindowPreloadState (identity: Identity, payload: { state: any; mandatory?: boolean; url: any; allDone?: any; }) {
    const { uuid, name } = identity;
    const { url, state, allDone } = payload;
    const updateTopic = allDone ? 'preload-scripts-state-changed' : 'preload-scripts-state-changing';
    const frameInfo = getInfoByUuidFrame(identity);
    let ofEntity: InjectableContext | false;
    if (frameInfo.entityType === 'iframe') {
        ofEntity = getEntityByUuidFrame(frameInfo.parent.uuid, frameInfo.parent.name);
    } else {
        ofEntity = getEntityByUuidFrame(uuid, name);
    }

    if (!ofEntity) {
        return writeToLog('info', `setWindowPreloadState missing openfinWindow ${uuid} ${name}`);
    }
    let { preloadScripts } = ofEntity;

    // Single preload script state change
    if (!allDone) {
        if (frameInfo.entityType === 'iframe') {
            let frameState = ofEntity.framePreloadScripts[name];
            if (!frameState) {
                frameState = ofEntity.framePreloadScripts[name] = [];
            }
            let preloadScript = frameState.find(e => e.url === url);
            if (!preloadScript) {
                frameState.push(preloadScript = { url });
            }
            preloadScripts = [preloadScript];
        } else {
            preloadScripts = ofEntity.preloadScripts.filter(e => e.url === url);
        }
        if (preloadScripts) {
            preloadScripts[0].state = state;
        } else {
            writeToLog('info', `setWindowPreloadState missing preloadState ${uuid} ${name} ${url} `);
        }
    }

    if (frameInfo.entityType === 'window') {
        ofEvents.emit(route.window(updateTopic, uuid, name), {
            name,
            uuid,
            preloadScripts
        });
    } // @TODO ofEvents.emit(route.frame for iframes
}