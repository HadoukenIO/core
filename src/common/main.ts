
import { parse as parseUrl } from 'url';
import { Identity } from '../shapes';

export function isChromePageUrl(url: string): boolean {
    const { buildFlags } = <any>process; // added by Runtime
    if (buildFlags && buildFlags.enableChromium) {
        const protocol = parseUrl(url).protocol || '';
        return protocol.startsWith('chrome');
    } else {
        return false;
    }
}

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

export const getIdentityFromObject = (obj: any): Identity => {
    const { uuid, name } = obj;
    return { uuid, name };
};
