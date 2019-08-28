
import { parse as parseUrl } from 'url';
import { Identity } from '../shapes';
import { Rectangle } from 'electron';

const chromePageWhiteList : string[] = [
    'chrome://about',
    'chrome://accessibility',
    'chrome://appcache-internals',
    'chrome://cache',
    'chrome://chrome-urls',
    'chrome://conflicts',
    'chrome://crashes',
    'chrome://credits',
    'chrome://discards',
    'chrome://downloads',
    'chrome://extensions',
    'chrome://flags',
    'chrome://flash',
    'chrome://gcm-internals',
    'chrome://gpu',
    'chrome://histograms',
    'chrome://invalidations',
    'chrome://media-engagement',
    'chrome://nacl',
    'chrome://net-export',
    'chrome://net-internals',
    'chrome://password-manager-internals',
    'chrome://policy',
    'chrome://print',
    'chrome://profiler',
    'chrome://quota-internals',
    'chrome://serviceworker-internals',
    'chrome://site-engagement',
    'chrome://system',
    'chrome://taskscheduler-internals',
    'chrome://tracing',
    'chrome://version',
    'chrome://view-http-cache',
    'chrome://webrtc-internals',
    'chrome://inducebrowsercrashforrealz',
    'chrome://crash',
    'chrome://crashdump',
    'chrome://kill',
    'chrome://hang',
    'chrome://shorthang',
    'chrome://gpuclean',
    'chrome://gpucrash',
    'chrome://gpuhang',
    'chrome://memory-exhaust',
    'chrome://restart'
];

export function isAboutPageUrl(url: string): boolean {
    return url && url.startsWith('about:');
}

export function isValidChromePageUrl(url: string): boolean {
    // const protocol = parseUrl(url).protocol || '';
    // return protocol.startsWith('chrome');
    return chromePageWhiteList.some(element => url.startsWith(element));
}

function isChromePageUrl(url: string): boolean {
    const protocol = parseUrl(url).protocol || '';
    return protocol.startsWith('chrome');
}

export function isFileUrl(url: string): boolean {
    const protocol = parseUrl(url).protocol || '';
    return protocol.startsWith('file');
}

export function isHttpUrl(url: string): boolean {
    const protocol = parseUrl(url).protocol || '';
    return protocol.startsWith('http'); // will work for https too
}

export function isURLAllowed(url: string): boolean {
    if (isChromePageUrl(url)) {
        const { buildFlags } = <any>process; // added by Runtime
        return buildFlags && buildFlags.enableChromium && isValidChromePageUrl(url);
    } else {
        return true;
    }
}

export function uriToPath(uri: string): string {
    return uri
        .replace(/^file:\/\/\/?/, '')
        .replace(/%20/g, ' ');
}

export const getIdentityFromObject = (obj: any): Identity => {
    const { uuid, name } = obj;
    return { uuid, name };
};

export function isEnableChromiumBuild(): boolean {
    const { buildFlags } = <any> process;
    return buildFlags && buildFlags.enableChromium;
}

export function noop(): void {
    // empty
}

export function isFloat(n: any): boolean {
    return Number(n) === n && n % 1 !== 0;
}

export function isObject(item: any): boolean {
    return (item && typeof item === 'object' && !Array.isArray(item));
}

// Deep merge https://stackoverflow.com/a/34749873
export function mergeDeep(target: any, ...sources: any[]): any {
    if (!sources.length) {
        return target;
    }

    const source = sources.shift();

    if (isObject(target) && isObject(source)) {
        const keys = Object.keys(source);

        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];

            if (isObject(source[key])) {
                if (!target[key]) {
                    Object.assign(target, { [key]: {} });
                }
                mergeDeep(target[key], source[key]);
            } else {
                Object.assign(target, { [key]: source[key] });
            }
        }
    }

    return mergeDeep(target, ...sources);
}

// Adjust coordinates of payloads based on scaling. **Mutates** the object!
export function adjustCoordsScaling(coords: any, runtimeDpi: number, sourceDpi: number): any {
    const propsToAdjust = ['mouseX', 'mouseY', 'x', 'y', 'left', 'right', 'top', 'bottom'];
    propsToAdjust.forEach(prop => {
        if (typeof coords[prop] === 'number') {
            coords[prop] = coords[prop] * runtimeDpi / sourceDpi;
        }
    });
}
