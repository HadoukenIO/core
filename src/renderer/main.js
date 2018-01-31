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
'use strict';

let fs = require('fs');
let path = require('path');
const coreState = require('../browser/core_state.js');

// check resources/adapter/openfin-desktop.js then
// resources/adapter.asar/openfin-desktop.js
// for ease of developement
let jsAdapter = '';
const searchPaths = ['adapter', 'adapter.asar'];
for (let adapterPath of searchPaths) {
    try {
        jsAdapter = fs.readFileSync(path.join(process.resourcesPath, adapterPath, 'openfin-desktop.js'), 'utf8');
        break;
    } catch (error) {
        continue;
    }
}

let jsAdapterV2 = '';
try {
    const jsAdapterV2Path = path.resolve(__dirname, '../../node_modules/hadouken-js-adapter/out/js-adapter.js');
    jsAdapterV2 = fs.readFileSync(jsAdapterV2Path, 'utf8');
} catch (error) {}

// Remove strict (Prevents, as of now, poorly understood memory lifetime scoping issues with remote module)
let me = fs.readFileSync(path.join(__dirname, 'api-decorator.js'), 'utf8');
me = me.slice(13);

module.exports.api = (windowId) => {
    const mainWindowOptions = coreState.getMainWindowOptions(windowId);
    const enableV2Api = ((mainWindowOptions || {}).experimental || {}).v2Api;
    const v2AdapterShim = (!enableV2Api ? '' : jsAdapterV2);

    return `${me} ; ${jsAdapter}; ${v2AdapterShim} ; fin.__internal_.ipc = null;`;
};
