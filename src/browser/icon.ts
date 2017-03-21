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
import {app, resourceFetcher} from 'electron'; // Electron app
import {stat, mkdir} from 'fs';
import {join, parse} from 'path';
import {parse as parseUrl} from 'url';
import {createHash} from 'crypto';
import {isURL, isURI, uriToPath} from '../common/regex';

/**
 * Fetches icon file path. Downloads the icon if it doesn't exist yet.
 */
export function fetch(appUuid: string, iconUrl: string, callback: (error: null|Error, path?: string) => any): void {
    if (!iconUrl || typeof iconUrl !== 'string') {
        callback(new Error(`Bad icon url: '${iconUrl}'`));
        return;
    }

    if (!isURL(iconUrl)) {
        if (isURI(iconUrl)) {
            callback(null, uriToPath(iconUrl));
        } else {
            callback(new Error(`Invalid icon url: '${iconUrl}'`));
        }
        return;
    }

    const appCacheDir = getAppCacheDir(appUuid);
    const iconFilePath = getFilePath(appCacheDir, iconUrl);

    stat(iconFilePath, (err: null|Error) => {
        if (err) {
            stat(appCacheDir, (err: null|Error) => {
                if (err) {
                    mkdir(appCacheDir, () => {
                        download(iconUrl, iconFilePath, callback);
                    });
                } else {
                    download(iconUrl, iconFilePath, callback);
                }
            });
        } else if (remoteFileIsYoungerThanCachedFile(iconUrl, iconFilePath)) {
            download(iconUrl, iconFilePath, callback);
        } else {
            callback(null, iconFilePath);
        }
    });
}

function remoteFileIsYoungerThanCachedFile(remoteUrl: string, cachedFilePath: string) {
    //todo: make a RESTful HEAD request and if file at remoteUrl is missing, return false;
    //todo: else if file at remoteUrl is younger than file at cachedFilePath, return true;
    //todo: else return false
    return true; //for now we ae always fetching
}

/**
 * Generates a folder name for the app to store the icon in.
 */
function getAppCacheDir(appUuid: string): string {
    const appUuidHash = generateHash(appUuid);
    const userDataDir = app.getPath('userData');
    return join(userDataDir, 'Cache', appUuidHash);
}

/**
 * Generates icon file name and returns a full path.
 */
function getFilePath(appCacheDir: string, iconUrl: string): string {
    const iconUrlHash = generateHash(iconUrl);
    const iconUrlPathname = parseUrl(iconUrl).pathname;
    const iconFileExt = parse(iconUrlPathname).ext;
    const iconFilename = iconUrlHash + iconFileExt; // <HASH>.<EXT>
    return join(appCacheDir, iconFilename); // path/to/<HASH>.<EXT>
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
 * Downloads the icon from given url using Resource Fetcher and saves it into specified path
 */
function download(iconUrl: string, iconFilePath: string, callback: (error: null|Error, filePath: string) => any): void {
    const fetcher = new resourceFetcher('file');

    fetcher.on('fetch-complete', (event: string, status: string) => {
        if (status === 'success') {
            callback(null, iconFilePath);
        } else {
            callback(new Error(`Failed to download icon from ${iconUrl}`), iconFilePath);
        }
    });

    fetcher.setFilePath(iconFilePath);
    fetcher.fetch(iconUrl);
}
