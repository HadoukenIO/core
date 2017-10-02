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
import {app, net, ClientResponse} from 'electron'; // Electron app

let appQuiting: Boolean = false;
app.on('quit', () => { appQuiting = true; });

export interface FetchResponse {
    // elements of the array contain the data
    success: boolean;
    data?: string;
}

/**
 * Downloads a file to cache and/or retrieves it from cache and returns its status code, headers, and data
 */
export function cachedFetch(url: string): Promise<FetchResponse> {
    return new Promise((resolve, reject) => {
        if (!url || typeof url !== 'string') {
            reject(new Error(`Bad file url: '${url}'`));
            return;
        }

        if (appQuiting) {
            reject(new Error('Runtime is exiting'));
            return;
        }

        const request = net.request(url);

        request.on('error', reject); // this is an error making the request

        request.on('response', (response: ClientResponse) => {
            const fetchResponse: FetchResponse = <FetchResponse>{};
            const chunks: string[] = [];

            fetchResponse.success = response.statusCode === 200;

            if (!fetchResponse.success) {
                resolve(fetchResponse); // not an error, however `success` will be false and `data` will be undefined
                return;
            }

            response.on('error', reject); // this is an error receiving the response

            response.on('data', (chunk: string) => {
                chunks.push(chunk);
            });

            response.on('end', () => {
                fetchResponse.data = chunks.join('');
                resolve(fetchResponse);
            });
        });

        request.end();
    });
}

