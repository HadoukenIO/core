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
import { app, net, ClientResponse, nativeImage, NativeImage } from 'electron'; // Electron app
import { stat, mkdir, readFile, writeFile, unlink } from 'fs';
import { join, parse } from 'path';
import { parse as parseUrl } from 'url';
import {createHash} from 'crypto';
import * as log from './log';

import { isURL, isICO, isImageFile, Patterns } from '../common/regex';
import { getDataURL } from './assets';

let appQuitting: boolean = false;
app.on('quit', () => { appQuitting = true; });

const ERR_QUITTING: string = 'Runtime is exiting';

export class FetchResponse {
    constructor(success: boolean = false, data?: string, isImageData?: boolean) {
        this.success = success;
        this.data = data;
        this.isImageData = isImageData;
    }
    public success: boolean;
    public data: string;
    private isImageData: boolean;
    private image: NativeImage;
    private waitForIcoFile: Promise<NativeImage>;

    // simple createFromBuffer for all data (except .ico files which need to use createFromPath)
    public getNativeImage(): Promise<NativeImage> {
        let image: NativeImage = this.image;

        if (!image) {
            if (this.success && this.isImageData) {
                image = nativeImage.createFromBuffer(new Buffer(this.data, 'binary'));
            } else {
                log.writeToLog('error', new Error('Attempt to get image from non-image data!'));
                image = nativeImage.createFromDataURL(getDataURL('blank-1x1.png'));
            }
            this.image = image;
        }

        return Promise.resolve(image);
    }

    // used to createFromPath from an .ico file that is already a file
    public getNativeImageFromPath(path: string): Promise<NativeImage> {
        let image: NativeImage = this.image;

        if (!image) {
            if (this.success && isICO(path)) {
                image = nativeImage.createFromPath(path);
            } else {
                image = FetchResponse.prototype.getNativeImage.call(this);
            }
            this.image = image;
        }

        return Promise.resolve(image);
    }

    // used to createFromPath from an .ico file created from downloaded data
    public getNativeImageFromCreatedPath(url: string): Promise<NativeImage> {
        let waitForIcoFile: Promise<NativeImage> = this.waitForIcoFile;

        if (!waitForIcoFile) {
            if (this.success && isICO(url)) {
                waitForIcoFile = makeCacheDir('ico')
                    .then(dirPath => getFile(dirPath, url, this.data, 'binary'))
                    .then(filePath => createFromPath(filePath, 20000)) // 20s = small window for possible reuse
                    .catch(err => {
                        log.writeToLog('error', err);
                        return nativeImage.createFromDataURL(getDataURL('blank-1x1.png'));
                    });
            } else {
                waitForIcoFile = Promise.resolve(FetchResponse.prototype.getNativeImage.call(this));
            }
            this.waitForIcoFile = waitForIcoFile;
        }

        return waitForIcoFile;
    }
}

type Fetcher = (url: string, encoding: string) => Promise<FetchResponse>;

/**
 * Downloads a file to cache and/or retrieves it from cache and returns its status code, headers, and data
 */
export function cachedFetch(url: string, encoding: string = 'utf8'): Promise<FetchResponse> {
    if (!url || typeof url !== 'string') {
        return Promise.reject(new Error(`Bad file url: '${url}'`));
    }

    if (appQuitting) {
        return Promise.reject(new Error(ERR_QUITTING));
    }

    const fetcher: Fetcher = isURL(url) ? netRequester : fileRequester;

    return fetcher(url, encoding);
}

function fileRequester(url: string, encoding: string): Promise<FetchResponse> {
    return new Promise((resolve, reject) => {
        // remove possible URI (file:/// scheme) prefix
        const filepath: string = url.replace(Patterns.URI, '');
        const isImage = isImageFile(url) || isICO(url);

        if (isImage) {
            encoding = 'binary';
        }

        readFile(filepath, encoding, (error: Error | string, data: string) => {
            if (error) {
                if (/ENOENT/.test((<Error>error).message || <string>error)) {
                    resolve(new FetchResponse(false));
                } else {
                    reject(error);
                }
            } else {
                const fetchResponse: FetchResponse = new FetchResponse(true, data, isImage);

                if (isImage) {
                    fetchResponse.getNativeImage = () => fetchResponse.getNativeImageFromPath(filepath);
                }

                resolve(fetchResponse);
            }
        });
    });
}

function netRequester(url: string, encoding: string): Promise<FetchResponse> {
    return new Promise((resolve, reject) => {
        const isImage = isImageFile(url) || isICO(url);
        const request = net.request(url);

        if (isImage) {
            encoding = 'binary';
        }

        request.on('error', reject); // this is an error making the request

        request.on('response', (response: ClientResponse) => {
            const chunks: string[] = [];
            const fetchResponse: FetchResponse = new FetchResponse(response.statusCode === 200, undefined, isImage);
            if (isImage) {
                fetchResponse.getNativeImage = () => fetchResponse.getNativeImageFromCreatedPath(url);
            }

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

function makeCacheDir(dir: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const appCacheDir: string = getAppCacheDir(dir);
        stat(appCacheDir, (err: Error) => {
            if (err) {
                mkdir(appCacheDir, (err: Error) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(appCacheDir);
                    }
                });
            } else {
                resolve(appCacheDir);
            }
        });
    });
}

const cachedFiles: { [key: string]: Promise<string> } = {};

// gets filepath from when ready
function getFile(dirPath: string, url: string, data: string | Buffer, encoding: string): Promise<string> {
    const filePath: string = getFilePath(dirPath, url);
    let result: Promise<string>;

    if (cachedFiles[filePath]) {
        result = Promise.resolve(cachedFiles[filePath]);
    } else {
        result = write(filePath, data, encoding);
        cachedFiles[filePath] = result;
    }

    return result;
}

// initiates async file write and returns a promise of the written filepath
function write(filePath: string, data: string | Buffer, encoding: string): Promise<string> {
    return new Promise((resolve, reject) => {
        stat(filePath, (err: Error) => {
            if (err) {
                writeFile(filePath, data, {encoding}, (err: Error) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(filePath);
                    }
                });
            } else {
                resolve(filePath);
            }
        });
    });
}

function createFromPath(filePath?: string, expires: number = -1): Promise<NativeImage> {
    const image: NativeImage = nativeImage.createFromPath(filePath);

    if (expires >= 0) {
        setTimeout(() => {
            if (cachedFiles[filePath]) {
                delete cachedFiles[filePath];
                const ignoreError = (err: Error): void => undefined; // file should be there but just in case
                unlink(filePath, ignoreError);
            }
        }, expires);
    }

    return Promise.resolve(image);
}

/**
 * Generates a folder name for the app to store the file in.
 */
function getAppCacheDir(dir: string): string {
    const userDataDir = app.getPath('userData');
    return join(userDataDir, 'Cache', dir);
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
