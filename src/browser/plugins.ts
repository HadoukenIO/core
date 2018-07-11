
import { getManifest } from './core_state';
import { Identity, Plugin } from '../shapes';
import { join as joinPath } from 'path';
import { readFile } from 'fs';
import { rvmMessageBus } from './rvm/rvm_message_bus';
import { writeToLog } from './log';

/**
 * Gets a single plugin module
 */
export async function getModule(identity: Identity, name: string): Promise<string> {
    const { url: sourceUrl, manifest: { plugins = [] } } = getManifest(identity);
    const plugin = plugins.find((e: Plugin) => e.name === name);

    if (!plugin) {
        writeToLog('info', '[plugins] Failed to find specified plugin in the manifest');
        throw new Error('Failed to find specified plugin in the manifest');
    }

    const { payload } = await rvmMessageBus.getPluginInfo(sourceUrl, plugin);
    const { error, target, path } = payload;

    if (error) {
        writeToLog('info', `[plugins] Failed to get plugin info from RVM: ${error}`);
        throw new Error(error);
    }

    const pluginPath = joinPath(path, target);

    return await getContent(pluginPath);
}

/**
 * Gets plugin content from local path
 */
function getContent(pluginPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        readFile(pluginPath, 'utf8', (error, data) => {
            if (error) {
                writeToLog('info', `[plugins] failed to get plugin content from ${pluginPath}: ${error}`);
                reject('Failed to load plugin');
            } else {
                resolve(data);
            }
        });
    });
}
