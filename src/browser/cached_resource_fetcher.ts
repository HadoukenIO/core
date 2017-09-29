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
import { app, net, ClientResponse } from 'electron'; // Electron app
import * as fs from 'fs';
import { isURL, Patterns } from '../common/regex';

let appQuiting: Boolean = false;
app.on('quit', () => { appQuiting = true; });

export interface FetchResponse {
    // elements of the array contain the data
    success: boolean; // reflects statusCode === 200
    statusCode: number;
    headers: { [key: string]: any }[];
    data?: string;
}

type Fetcher = (url: string, encoding: string) => Promise<FetchResponse>;

/**
 * Downloads a file to cache and/or retrieves it from cache and returns its status code, headers, and data
 */
export function cachedFetch(url: string, encoding: string = 'utf-8'): Promise<FetchResponse> {
    if (!url || typeof url !== 'string') {
        return Promise.reject(new Error(`Bad file url: '${url}'`));
    }

    if (appQuiting) {
        return Promise.reject(new Error('Runtime is exiting'));
    }

    const fetcher: Fetcher = isURL(url) ? netRequester : fileRequester;

    return fetcher(url, encoding).then((fetchResponse: FetchResponse): FetchResponse => {
        let buffer: Buffer;

        // add a lazy `buffer` property (a getter) that creates and returns a buffer
        // on first invocation and returns that same buffer next time it is called
        Object.defineProperty(fetchResponse, 'buffer', {
            get: () => buffer = buffer || new Buffer(fetchResponse.data, encoding)
        });

        return fetchResponse;
    });
}

function fileRequester(url: string, encoding: string): Promise<FetchResponse> {
    // remove possible URI (file:/// scheme) prefix
    const filepath: string = url.replace(Patterns.URI, '');

    return new Promise((resolve, reject) => {
        fs.readFile(filepath, encoding, (error, data) => {
            if (error) {
                reject(error);
            } else {
                resolve(<FetchResponse>{
                    success: true,
                    statusCode: 200,
                    headers: [],
                    data
                });
            }
        });
    });
}

function netRequester(url: string, encoding: string): Promise<FetchResponse> {
    return new Promise((resolve, reject) => {
        const request = net.request(url);

        request.on('error', reject); // this is an error making the request

        request.on('response', (response: ClientResponse) => {
            const chunks: string[] = [];
            const fetchResponse: FetchResponse = <FetchResponse>{
                success: response.statusCode === 200,
                statusCode: response.statusCode,
                headers: response.headers
            };

            if (!fetchResponse.success) {
                resolve(fetchResponse); // not an error, however `success` will be false and `data` will be undefined
                return;
            }

            response.on('error', reject); // this is an error receiving the response

            response.setEncoding(encoding);
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
