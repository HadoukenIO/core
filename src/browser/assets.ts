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

import * as path from 'path';

export type DataURL = string;

const assets: {[key: string]: DataURL} = {
    'blank-1x1.png': 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNiYAAAAAkAAxkR2eQAAAAASUVORK5CYII='
};

const contentTypesByExt: {[key: string]: string} = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif'
};

// Returns `undefined` when filename is unknown or no content type nor known extension.
export function getDataURL(filename: string, contentType?: string): DataURL {
    if (!contentType) {
        const ext: string = path.extname(filename);
        contentType = contentTypesByExt[ext.substr(1).toLowerCase()];
    }
    if (contentType) {
        return `data:image/${contentType};base64,${assets[filename]}`;
    }
}
