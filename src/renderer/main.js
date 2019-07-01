'use strict';

let fs = require('fs');
let path = require('path');
const coreState = require('../browser/core_state.js');

function readAdapterFromSearchPaths(searchPaths, packageFile) {
    let adapter = '';
    for (let adapterPath of searchPaths) {
        try {
            adapter = fs.readFileSync(path.join(process.resourcesPath, adapterPath, packageFile), 'utf8');
            break;
        } catch (error) {
            continue;
        }
    }
    return adapter;
}

// check resources/adapter/openfin-desktop.js then
// resources/adapter.asar/openfin-desktop.js
// for ease of developement
const searchPaths = ['adapter', 'adapter.asar'];
const jsAdapter = readAdapterFromSearchPaths(searchPaths, 'openfin-desktop.js');

// This order of lookup paths is taken from runtime/lib/browser/init.js
const searchPathsV2Api = [
    'default_app', 'core', 'app', 'core.asar', 'app.asar', 'default_app.asar'
].map(e => path.join(e, 'js-adapter'));
const jsAdapterV2 = readAdapterFromSearchPaths(searchPathsV2Api, 'js-adapter.js');

// Remove strict (Prevents, as of now, poorly understood memory lifetime scoping issues with remote module)
let me = fs.readFileSync(path.join(__dirname, 'api-decorator.js'), 'utf8');
me = me.slice(13);

const api = (webContentsId, initialOptions) => {
    const windowOptionSet = initialOptions || coreState.getWebContentsInitialOptionSet(webContentsId) || {};
    const mainWindowOptions = windowOptionSet.options || {};
    const enableV2Api = (mainWindowOptions.experimental || {}).v2Api;
    const v2AdapterShim = (!enableV2Api ? '' : jsAdapterV2);
    const { uuid, name } = mainWindowOptions;
    windowOptionSet.runtimeArguments = JSON.stringify(coreState.args);
    windowOptionSet.licenseKey = coreState.getLicenseKey({ uuid, name });

    return [
        `global.__startOptions = ${JSON.stringify(windowOptionSet)}`,
        me,
        jsAdapter,
        v2AdapterShim,
        `fin.__internal_.ipc = null`
    ].join(';');
};

module.exports.api = api;

module.exports.apiWithOptions = (webContentsId) => {
    const initialOptions = coreState.getWebContentsInitialOptionSet(webContentsId);

    // break the remote link
    return JSON.stringify({
        apiString: api(webContentsId, initialOptions),
        initialOptions: initialOptions
    });
};
