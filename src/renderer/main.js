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
'use strict';

import { join } from 'path';
import { readFileSync } from 'fs';
import { getWindowInitialOptionSet } from '../browser/core_state.js';

function getAdapter(searchPaths, packageFile) {
    let adapter = '';

    for (const partialPath of searchPaths) {
        try {
            const adapterPath = join(process.resourcesPath, partialPath, packageFile);
            adapter = readFileSync(adapterPath, 'utf8');
            break;
        } catch (error) {
            continue;
        }
    }

    return adapter;
}

export const api = (windowId) => {
    const windowOptionSet = getWindowInitialOptionSet(windowId);
    const enableV2Api = (windowOptionSet.options.experimental || {}).v2Api;
    const jsAdapter = getAdapter(['adapter', 'adapter.asar'], 'openfin-desktop.js');
    const jsAdapterV2 = enableV2Api ? getAdapter(['js-adapter', 'js-adapter.asar'], 'js-adapter.js') : '';
    let apiDecorator = readFileSync(join(__dirname, 'api-decorator.js'), 'utf8');

    // This removes 'use strict' (For now, poorly understood memory lifetime scoping issues with remote module)
    apiDecorator = apiDecorator.slice(13);

    return [
        `global.__startOptions = ${JSON.stringify(windowOptionSet)}`,
        apiDecorator,
        jsAdapter,
        jsAdapterV2,
        `fin.__internal_.ipc = null`
    ].join(';');
};
