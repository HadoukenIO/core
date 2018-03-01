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
import {stat, mkdir, createWriteStream, readFile as fsReadFile} from 'fs';
import {join, parse} from 'path';
import {parse as parseUrl} from 'url';
import {createHash} from 'crypto';
import * as log from './log';
import { isFileUrl, isHttpUrl, uriToPath } from '../common/main';
import { addPendingAuthRequests, createAuthUI } from './authentication_delegate';
import { AuthCallback } from '../shapes';

let appQuiting: Boolean = false;

const expectedStatusCode = /^[23]/; // 2xx & 3xx status codes are okay
const fetchMap: Map<string, Promise<any>> = new Map();
const authMap: Map<string, Function> = new Map();  // auth UUID => auth callback

app.on('quit', () => { appQuiting = true; });

/**
 * Downloads a file if it doesn't exist in cache yet.
 */
export async function cachedFetch(appUuid: string, url: string, callback: (error: null|Error, path?: string) => any): Promise<any> {
    if (typeof url !== 'string') {
        callback(new Error(`Bad file url: '${url}'`));
        return;
    }
    if (appQuiting) {
        callback(new Error('Runtime is exiting'));
        return;
    }

    if (!isHttpUrl(url)) {
        if (isFileUrl(url)) {
            callback(null, uriToPath(url));
        } else {
            // this is C:\whatever\
            stat(url, (err: null|Error) => {
                if (err) {
                    app.vlog(1, `cachedFetch invalid file url ${url}`);
                    callback(new Error(`Invalid file url: '${url}'`));
                } else {
                    callback(null, url);
                }
            });
        }
        return;
    }

    const appCacheDir = getAppCacheDir(appUuid);
    const filePath = getFilePath(appCacheDir, url);
    let err: Error;

    app.vlog(1, `cachedFetch ${url} ${filePath}`);
    if (fetchMap.has(filePath)) {
        fetchMap.get(filePath).then(() => callback(null, filePath)).catch(callback);
    } else {
        const p = new Promise( async (resolve, reject) => {
            try {
                await prepDownloadLocation(appCacheDir);
                await download(url, filePath);
                callback(null, filePath);
                resolve(filePath);
            } catch (e) {
                err = e;
                app.vlog(1, `cachedFetch uuid ${appUuid} url ${url} file ${filePath} err ${e.message}`);
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
                app.vlog(1, `cachedFetch makeDirectory error, check EEXIST ${err.message}`);
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


async function prepDownloadLocation(appCacheDir: string) {
    const appCacheDirExists = await pathExists(appCacheDir);

    if (appCacheDirExists) {
        return;
    }

    const rootCachePath = getRootCachePath();
    const cacheRootPathExists = await pathExists(rootCachePath);

    if (!cacheRootPathExists) {
        await makeDirectory(rootCachePath);
    }

    const cacheAppPathExists = await pathExists(appCacheDir);
    if (!cacheAppPathExists) {
        await makeDirectory(appCacheDir);
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

function authRequest(url: string, authInfo: any, authCallback: AuthCallback): void {
    const uuid: string = app.generateGUID();
    const identity = {
        name: uuid,
        uuid: uuid,
        resourceFetch: true // not tied to a window
    };
    log.writeToLog(1, `fetchURL login event ${url} uuid ${uuid} ${JSON.stringify(authInfo)}`, true);
    authMap.set(uuid, authCallback);
    addPendingAuthRequests(identity, authInfo, authCallback);
    createAuthUI(identity);
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

        request.on('login', (authInfo: any, callback: AuthCallback) => {
            authRequest(filePath, authInfo, callback);
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
    request.on('login', (authInfo: any, callback: AuthCallback) => {
        authRequest(url, authInfo, callback);
    });
    request.once('error', (err: Error) => {
        onError(err);
    });
    request.end();
}

/**
 * Fetches a file to disk and then reads it
 */
export function fetchReadFile(url: string, isJSON: boolean): Promise<string|object> {
    return new Promise((resolve, reject) => {
        if (isHttpUrl(url)) {
            fetchURL(url, resolve, reject);

        } else if (isFileUrl(url)) {
            const pathToFile = uriToPath(url);

            readFile(pathToFile, isJSON)
                .then(resolve)
                .catch(reject);

        } else {
            stat(url, (err: null|Error) => {
                if (err) {
                    reject(new Error(`URL protocol is not supported in ${url}`));
                } else {
                    readFile(url, isJSON)
                        .then(resolve)
                        .catch(reject);
                }
            });
        }
    });
}

/**
 * Reads a file from disk
 */
export function readFile(pathToFile: string, isJSON: boolean): Promise<string|object> {
    return new Promise((resolve, reject) => {
        fsReadFile(pathToFile, 'utf-8', (error, data) => {
            if (error) {
                reject(error);
            } else {
                isJSON ? resolve(JSON.parse(data)) : resolve(data);
            }
        });
    });
}

export function authenticateFetch(uuid: string, username: string, password: string): void {
    if (authMap.has(uuid)) {
        log.writeToLog(1, `Auth resource fetch uuid ${uuid} ${username}`, true);
        authMap.get(uuid).call(null, username, password);
        authMap.delete(uuid);
    } else {
        log.writeToLog(1, `Missing resource auth uuid ${uuid}`, true);
    }
}
