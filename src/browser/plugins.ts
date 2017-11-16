/*
Copyright 2017 OpenFin Inc.

Licensed under OpenFin Commercial License you may not use this file except in compliance with your Commercial License.
Please contact OpenFin Inc. at sales@openfin.co to obtain a Commercial License.
*/

const Window = require('./api/window.js').Window;
import * as path from 'path';
import { getManifest } from './core_state';
import { Identity, Plugin } from '../shapes';
import { readFile } from 'fs';
import { rvmMessageBus } from './rvm/rvm_message_bus';
import { writeToLog } from './log';

interface PluginWithContent extends Plugin {
    _content: string;
}

/**
 * A map of already-retrieved plugin module paths.
 *
 * Examples:
 * 'pluginName: 1.0.0' -> 'path\to\plugin\injectable\script.js'
 * 'pluginName2: 0.0.1' -> '' // plugin/version doesn't exist
 */
const pluginPaths: Map<string, string> = new Map();

/**
 * Gets all plugins defined in app's manifest
 */
export async function getModules(identity: Identity): Promise<PluginWithContent[]> {
    const { url, manifest } = getManifest(identity);
    const { plugin: plugins = [] } = manifest || {};
    const promises = plugins.map((plugin: Plugin) => getModule(identity, url, plugin));
    return await Promise.all(promises);
}

/**
 * Gets a single plugin module
 */
async function getModule(identity: Identity, sourceUrl: string, plugin: Plugin): Promise<PluginWithContent> {
    const id = `${plugin.name}: ${plugin.version}`;
    let pluginPath;

    if (pluginPaths.has(id)) {
        pluginPath = pluginPaths.get(id);
    } else {
        const {payload} = await rvmMessageBus.getPluginInfo(sourceUrl, plugin);
        pluginPath = !payload.error ? path.join(payload.path, payload.target) : '';
        pluginPaths.set(id, pluginPath);
    }

    return await addContent(identity, plugin, pluginPath);
}

/**
 * Reads and adds module content to plugin while updating plugin state
 */
function addContent(identity: Identity, plugin: Plugin, pluginPath: string): Promise<PluginWithContent> {
    return new Promise((resolve) => {
        const { uuid, name } = identity;
        const { name: pluginName, version } = plugin;
        const log = (msg: string) => {
            writeToLog('info', `[plugins] [${uuid}]-[${name}]: ${msg}`);
        };

        log(`Started loading plugin module [${pluginName} ${version}]`);
        Window.setWindowPluginState(identity, {...plugin, state: 'load-started'});

        readFile(pluginPath, 'utf8', (error, data) => {
            if (error) {
                log(`Failed loading plugin module [${pluginName} ${version}]: ${error}`);
                Window.setWindowPluginState(identity, {...plugin, state: 'load-failed'});
                resolve({...plugin, _content: ''});
            } else {
                log(`Succeeded loading plugin module [${pluginName} ${version}]`);
                Window.setWindowPluginState(identity, {...plugin, state: 'load-succeeded'});
                resolve({...plugin, _content: data});
            }
        });
    });
}
