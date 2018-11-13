
import { parse as parseUrl } from 'url';
import { Identity } from '../shapes';

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