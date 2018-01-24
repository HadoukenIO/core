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

import { parse as parseUrl } from 'url';

export function isFileUrl(url: string): boolean {
    const protocol = parseUrl(url).protocol || '';
    return protocol.startsWith('file');
}

export function isHttpUrl(url: string): boolean {
    const protocol = parseUrl(url).protocol || '';
    return protocol.startsWith('http'); // will work for https too
}

export function uriToPath(uri: string): string {
    return uri
        .replace(/^file:\/\/\/?/, '')
        .replace(/%20/g, ' ');
}
