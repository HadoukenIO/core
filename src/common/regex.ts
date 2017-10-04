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

export const Patterns: {[key: string]: RegExp} = {
    URL: /^https?:\/\//,
    URI: /^file:\/\/\//, // file:// is BAD; file:/// is GOOD
    ICO: /\.ico$/i,
    GIForJPGorPNG: /\.(gif|jpe?g|png)$/i
};

export function isURL(str: string): boolean {
    return Patterns.URL.test(str);
}

export function isURI(str: string): boolean {
    return Patterns.URI.test(str);
}

export function isICO(str: string): boolean {
    return Patterns.ICO.test(str);
}

export function isImageFile(uri: string): boolean {
    return Patterns.GIForJPGorPNG.test(uri);
}

export function uriToPath(uri: string): string {
    return uri.substring(8).replace(/%20/g, ' ');
}
