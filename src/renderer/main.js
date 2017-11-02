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
let coreState = require('../browser/core_state.js');
let me = fs.readFileSync(path.join(__dirname, 'api-decorator.js'), 'utf8');
let jsAdapter2Path = path.join(process.resourcesPath, 'adapter-new.asar', 'bundle.js');
let log = require('../browser/log');
const API_NEXT_OPTION = 'apiNext';

let newAdapter = '';

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

// Remove strict (Prevents, as of now, poorly understood memory lifetime scoping issues with remote module)
me = me.slice(13);

module.exports.api = (uuid) => {
    const app = coreState.getAppObjByUuid(uuid);

    if (app._options[API_NEXT_OPTION]) {
        newAdapter = fs.readFileSync(jsAdapter2Path, 'utf8');
    }
    return `${me} ; ${jsAdapter}; ${newAdapter} ; fin.__internal_.ipc = null;`;
};
