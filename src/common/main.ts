
import { parse as parseUrl } from 'url';
import { Identity } from '../shapes';

export function isAboutPageUrl(url: string): boolean {
    return url && url.startsWith('about:');
}

export function isChromePageUrl(url: string): boolean {
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
        return buildFlags && buildFlags.enableChromium;
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
