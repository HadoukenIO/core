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
import {app, net} from 'electron'; // Electron app
import {stat, mkdir, writeFileSync, createWriteStream} from 'fs';
import {join, parse} from 'path';
import {parse as parseUrl} from 'url';
import {createHash} from 'crypto';
import {isURL, isURI, uriToPath} from '../common/regex';
import * as log from './log';

let appQuiting: Boolean = false;

const expectedStatusCode = /^[23]/; // 2xx & 3xx status codes are okay
const fetchMap: Map<string, Promise<any>> = new Map();

app.on('quit', () => { appQuiting = true; });

/**
 * Downloads a file if it doesn't exist in cache yet.
 */
export async function cachedFetch(appUuid: string, fileUrl: string, callback: (error: null|Error, path?: string) => any): Promise<any> {
    if (!fileUrl || typeof fileUrl !== 'string') {
        callback(new Error(`Bad file url: '${fileUrl}'`));
        return;
    }
    if (appQuiting) {
        callback(new Error('Runtime is exiting'));
        return;
    }

    if (!isURL(fileUrl)) {

        // this is the case where file:///
        if (isURI(fileUrl)) {
            callback(null, uriToPath(fileUrl));
        } else {
            // this is C:\whatever\
            stat(fileUrl, (err: null|Error) => {
                if (err) {
                    app.vlog(1, `cachedFetch invalid file url ${fileUrl}`);
                    callback(new Error(`Invalid file url: '${fileUrl}'`));
                } else {
                    callback(null, fileUrl);
                }
            });
        }
        return;
    }

    const appCacheDir = getAppCacheDir(appUuid);
    const filePath = getFilePath(appCacheDir, fileUrl);
    let err: Error;

    app.vlog(1, `cachedFetch ${fileUrl} ${filePath}`);
    if (fetchMap.has(filePath)) {
        fetchMap.get(filePath).then(() => callback(null, filePath)).catch(callback);
    } else {
        const p = new Promise( async (resolve, reject) => {
            try {
                await prepDownloadLocation(appCacheDir);
                await download(fileUrl, filePath);
                callback(null, filePath);
                resolve(filePath);
            } catch (e) {
                err = e;
                app.vlog(1, `cachedFetch uuid ${appUuid} url ${fileUrl} file ${filePath} err ${e.message}`);
                callback(err, filePath);
                reject(err);
            } finally {
                fetchMap.delete(filePath);
            }
        });
        fetchMap.set(filePath, p);
    }
}

function pathExists (location: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
        stat(location, (err: null | Error) => {
            if (err) {
                resolve(false);
            } else {
                resolve(true);
            }
        });
    });
}

function makeDirectory(location: string) {
    return new Promise((resolve, reject) => {
        mkdir(location, (err: null | Error) => {
            if (err) {
                // EEXIST not an error
                pathExists(location).then(value => value ? resolve() : reject(err))
                    .catch(() => {
                        app.vlog(1, `cachedFetch makeDirectory error ${err.message}`);
                        reject(err);
                    });
            } else {
                resolve();
            }
        });
    });
}

let makingCacheDir = false;
let makingAppDir = false;

async function prepDownloadLocation(appCacheDir: string) {
    const appCacheDirExists = await pathExists(appCacheDir);

    if (appCacheDirExists) {
        return;
    }

    const rootCachePath = getRootCachePath();
    const cacheRootPathExists = await pathExists(rootCachePath);

    if (!cacheRootPathExists && !makingCacheDir) {
        makingCacheDir = true;
        await makeDirectory(rootCachePath);
        makingCacheDir = false;
    }

    if (!makingAppDir) {
        makingAppDir = true;
        await makeDirectory(appCacheDir);
        makingAppDir = false;
    }

    return;
}


function getRootCachePath () {
    return join(app.getPath('userData') , 'Cache');
}

/**
 * Generates a folder name for the app to store the file in.
 */
function getAppCacheDir(appUuid: string): string {
    const appUuidHash = generateHash(appUuid);
    const rootCachePath = getRootCachePath();
    return join(rootCachePath, appUuidHash);
}

/**
 * Generates file name and returns a full path.
 */
function getFilePath(appCacheDir: string, fileUrl: string): string {
    const fileUrlHash = generateHash(fileUrl);
    const fileUrlPathname = parseUrl(fileUrl).pathname;
    const fileExt = parse(fileUrlPathname).ext;
    const filename = fileUrlHash + fileExt; // <HASH>.<EXT>
    return join(appCacheDir, filename); // path/to/<HASH>.<EXT>
}

/**
 * Generates SHA-256 hash
 */
function generateHash(str: string): string {
    const hash = createHash('sha256');
    hash.update(str);
    return hash.digest('hex');
}

/**
 * Downloads the file from given url using Resource Fetcher and saves it into specified path
 */
function download(fileUrl: string, filePath: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const request = net.request(fileUrl);
        const binaryWriteStream = createWriteStream(filePath, {
            encoding: 'binary'
        });

        request.once('response', (response: any) => {
            const { statusCode } = response;
            app.vlog(1, `cachedFetch download status ${filePath} ${statusCode} `);

            response.setEncoding('binary');
            response.on('data', (chunk: any) => {
                binaryWriteStream.write(chunk, 'binary');
            });
            response.once('error', (err: Error) => {
                reject(err);
            });
            response.on('end', () => {
                binaryWriteStream.once('close', () => {
                    resolve();
                });
                binaryWriteStream.once('error', (err: Error) => {
                    reject(err);
                });
                binaryWriteStream.end();

                if (!expectedStatusCode.test(statusCode)) {
                    const error = new Error(`Failed to download resource. Status code: ${statusCode}`);
                    reject(error);
                }
            });
        });

        request.once('error', (err: Error) => {
            reject(err);
        });

        request.end();
    });
}

export function fetchURL(url: string, done: (resp: any) => void, onError: (err: Error) => void ): void {
    log.writeToLog(1, `fetchURL ${url}`, true);
    const request = net.request(url);
    request.once('response', (response: any) => {
        let data = '';
        const { statusCode } = response;
        log.writeToLog(1, `fetchURL statusCode: ${statusCode} for ${url}`, true);
        if (!expectedStatusCode.test(statusCode)) {
            const error = new Error(`Failed to download resource. Status code: ${statusCode}`);
            onError(error);
        }
        response.setEncoding('utf8');
        response.once('error', (err: Error) => {
            onError(err);
        });
        response.on('data', (chunk: string) => {
            data = data.concat(chunk);
        });
        response.on('end', () => {
            log.writeToLog(1, `Contents from ${url}`, true);
            log.writeToLog(1, data, true);
            try {
                const obj = JSON.parse(data);
                done(obj);
            } catch (e) {
                onError(new Error(`Error parsing JSON from ${url}`));
            }
        });
    });
    request.once('login', (authInfo: any, callback: Function) => {
        //Simply provide empty credentials to raise the authentication error.
        //https://github.com/electron/blob/master/docs/api/client-request.md#event-login
        log.writeToLog(1, `fetchURL login event ${url}`, true);
        callback();
    });
    request.once('error', (err: Error) => {
        onError(err);
    });
    request.end();
}
