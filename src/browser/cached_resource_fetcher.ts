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
import {app, resourceFetcher, net} from 'electron'; // Electron app
import {stat, mkdir, writeFileSync, createWriteStream} from 'fs';
import {join, parse} from 'path';
import {parse as parseUrl} from 'url';
import {createHash} from 'crypto';
import {isURL, isURI, uriToPath} from '../common/regex';
import * as log from './log';

let appQuiting: Boolean = false;

app.on('quit', () => { appQuiting = true; });

/**
 * Downloads a file if it doesn't exist in cache yet.
 */
export function cachedFetch(appUuid: string, fileUrl: string, callback: (error: null|Error, path?: string) => any): void {
    if (!fileUrl || typeof fileUrl !== 'string') {
        callback(new Error(`Bad file url: '${fileUrl}'`));
        return;
    }
    if (appQuiting) {
        callback(new Error('Runtime is exiting'));
        return;
    }

    // if (!isURL(fileUrl)) {
    //     if (isURI(fileUrl)) {
    //         callback(null, uriToPath(fileUrl));
    //     } else {
    //         stat(fileUrl, (err: null|Error) => {
    //             if (err) {
    //                 callback(new Error(`Invalid file url: '${fileUrl}'`));
    //             } else {
    //                 callback(null, fileUrl);
    //             }
    //         });
    //     }
    //     return;
    // }

    const appCacheDir = getAppCacheDir(appUuid);
    const filePath = getFilePath(appCacheDir, fileUrl);

    stat(filePath, (err: null | Error) => {
        if (err) {
            if (!appQuiting) {
                stat(appCacheDir, (err: null | Error) => {
                    if (err) {
                        if (!appQuiting) {
                            mkdir(appCacheDir, () => {
                                download(fileUrl, filePath, callback);
                            });
                        }
                    } else {
                        download(fileUrl, filePath, callback);
                    }
                });
            }
        } else if (remoteFileIsYoungerThanCachedFile(fileUrl, filePath)) {
            download(fileUrl, filePath, callback);
        } else {
            callback(null, filePath);
        }
    });
}

function remoteFileIsYoungerThanCachedFile(remoteUrl: string, cachedFilePath: string) {
    //todo: make a RESTful HEAD request and if file at remoteUrl is missing, return false;
    //todo: else if file at remoteUrl is younger than file at cachedFilePath, return true;
    //todo: else return false
    return true; //for now we are always fetching
}

/**
 * Generates a folder name for the app to store the file in.
 */
function getAppCacheDir(appUuid: string): string {
    const appUuidHash = generateHash(appUuid);
    const userDataDir = app.getPath('userData');
    return join(userDataDir, 'Cache', appUuidHash);
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
function download(fileUrl: string, filePath: string, callback: (error: null|Error, filePath: string) => any): void {
    // const fetcher = new resourceFetcher('file');
    // file uris are not getting cached??
    const request = net.request(fileUrl);
    let res = '';
    const bws = createWriteStream(filePath, {
        // encoding: 'binary',
        defaultEncoding: 'binary'
    });
    request.on('response', (response: any) => {
      // console.log(`STATUS: ${response.statusCode}`);
      // console.log(`HEADERS: ${JSON.stringify(response.headers)}`)
      response.setEncoding('binary');
      response.on('data', (chunk: any) => {
        // console.log(`BODY: ${chunk}`);
        res += chunk;
        bws.write(chunk, 'binary');
      });
      response.on('end', () => {
        log.writeToLog(1, 'done!', true);
        log.writeToLog(1, fileUrl, true);

        // writeFileSync(filePath, res);
        bws.end();
        setTimeout(() => { // wtf do we need to time out here?!?!?
            callback(null, filePath);
        }, 1000);

      });
    });
    request.end();

    // fetcher.once('fetch-complete', (event: string, status: string) => {
    //     if (status === 'success') {
    //         callback(null, filePath);
    //     } else {
    //         callback(new Error(`Failed to download file from ${fileUrl}`), filePath);
    //     }
    // });

    // fetcher.setFilePath(filePath);
    // fetcher.fetch(fileUrl);
}
