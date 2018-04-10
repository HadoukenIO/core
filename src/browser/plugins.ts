/*
Copyright 2018 OpenFin Inc.

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

import { getManifest } from './core_state';
import { Identity, Plugin } from '../shapes';
import { join as joinPath } from 'path';
import { readFile } from 'fs';
import { rvmMessageBus } from './rvm/rvm_message_bus';
import { writeToLog } from './log';

/**
 * A map of already-retrieved plugin module paths.
 *
 * Examples:
 * 'pluginName: 1.0.0' -> 'path\to\plugin\injectable\script.js'
 * 'pluginName2: 0.0.1' -> '' // plugin/version doesn't exist
 */
const pluginPaths: Map<string, string> = new Map();

/**
 * Gets a single plugin module
 */
export async function getModule(identity: Identity, plugin: Plugin, sourceUrl?: string): Promise<string> {
    if (!sourceUrl) {
        sourceUrl = getManifest(identity).url;
    }

    const id = `${plugin.name}: ${plugin.version}`;
    let pluginPath;

    if (pluginPaths.has(id)) {
        pluginPath = pluginPaths.get(id);
    } else {
        const { payload } = await rvmMessageBus.getPluginInfo(sourceUrl, plugin);
        const { error, target, path } = payload;

        if (error) {
            writeToLog('info', `[plugins] failed to get plugin info from RVM: ${error}`);
            throw error;
        }

        pluginPath = joinPath(path, target);
        pluginPaths.set(id, pluginPath);
    }

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
