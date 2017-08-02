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

// built-in modules
let fs = require('fs');

// local modules
import { cachedFetch } from './cached_resource_fetcher';


function fetchAndLoadPromise(identity, preload) {
    return fetchPromise(identity, preload).then(loadPromise);
}


function fetchPromise(identity, preload) {
    return new Promise((resolve, reject) => {
        cachedFetch(identity.uuid, preload.url, (fetchError, scriptPath) => {

            if (!fetchError) {
                resolve({ url: preload.url, optional: preload.optional, scriptPath });
            } else if (preload.optional) {
                resolve({ url: preload.url });
            } else {
                reject(new Error(`Preload scripts skipped due to bad fetch of required script: ${JSON.stringify(preload)}`));
            }

        });
    });
}


function loadPromise(preload) {
    return new Promise((resolve, reject) => {
        if (!preload.scriptPath) {
            resolve(); // bad fetch but we only get this far if script was optional so resolve
        } else {
            fs.readFile(preload.scriptPath, 'utf8', (readError, script) => {

                // todo: remove following workaround when RUN-3162 issue fixed
                //BEGIN WORKAROUND (RUN-3162 fetchError null on 404)
                if (!readError &&
                    /^(Cannot GET |<\?xml)/.test(script) && // 404 from various user agents
                    !preload.optional
                ) {
                    reject(new Error(`Preload scripts skipped due to bad fetch of required script: ${JSON.stringify(preload)}`));
                    return;
                }
                //END WORKAROUND

                if (!readError) {
                    resolve({ url: preload.url, script });
                } else if (preload.optional) {
                    resolve({ url: preload.url });
                } else {
                    reject(new Error(`Preload scripts skipped due to bad load of required script: ${JSON.stringify(preload)}`));
                }

            });
        }
    });
}

module.exports.fetchAndLoadPromise = fetchAndLoadPromise;
