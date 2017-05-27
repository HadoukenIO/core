/*
Copyright 2017 OpenFin Inc.

Licensed under OpenFin Commercial License you may not use this file except in compliance with your Commercial License.
Please contact OpenFin Inc. at sales@openfin.co to obtain a Commercial License.
*/

export type WindowRoute = (
    type: string,
    uuid?: string,
    name?: string,
    hyphenateUuidName?: boolean
) => string;

export type AbbrRoute = (
    type: string,
    subtopic?: string,
    subsubtopic?: string
) => string;

export interface Route {
    (
        channel: string,
        topic: string,
        subtopic?: string,
        subsubtopic?: string,
        hyphenateUuidName?: boolean
    ): string;

    application: AbbrRoute;
    externalApplication: AbbrRoute;
    'external-application': AbbrRoute;

    window: WindowRoute;
    externalWindow: WindowRoute;
    'external-window': WindowRoute;

    system: AbbrRoute;
    server: AbbrRoute;
    connection: AbbrRoute;
    runtime: AbbrRoute;

    rvmMessageBus: AbbrRoute;
    'rvm-message-bus': AbbrRoute;
}

interface Context { hyphenateUuidName: boolean }
const HYPHEN: Context = { hyphenateUuidName: true };

// returns 'channel/type' if only channel and type given
// returns 'channel/type/subtopic' in only channel, type, and subtopic given
// returns 'channel/type/subtopic/subsubtopic' if channel, type, subtopic, subsubtopic given and !(this && this.hyphenateUuidName)
// returns 'channel/type/subtopic-subsubtopic' if channel, type, subtopic, subsubtopic given and !!(this && hyphenateUuidName)
// note that this.hyphenateUuidName is overriden with hyphenateUuidName param when true or false
function router(
    channel: string,
    type: string,
    subtopic?: string,
    subsubtopic?: string,
    hyphenateUuidName?: boolean
): string {
    let result = `${channel}/${type}`;

    if (subtopic) {
        result += `/${subtopic}`;

        if (subsubtopic) {
            if (typeof hyphenateUuidName !== 'boolean') {
                hyphenateUuidName = this && this.hyphenateUuidName;
            }
            result += hyphenateUuidName ? '-' : '/';
            result += subsubtopic;
        }
    }
    return result;
}

const route: Route = <Route>router.bind(null);

route.application = <AbbrRoute>route.bind(null, 'application');
route.externalApplication = route['external-application'] = <AbbrRoute>router.bind(null, 'external-application');

route.window = <WindowRoute>router.bind(HYPHEN, 'window');
route.externalWindow = route['external-window'] = <WindowRoute>router.bind(HYPHEN, 'external-window');

route.system = <AbbrRoute>router.bind(null, 'system');
route.rvmMessageBus = route['rvm-message-bus'] = <AbbrRoute>router.bind(null, 'rvm-message-bus');
route.server = <AbbrRoute>router.bind(null, 'server');
route.connection = <AbbrRoute>router.bind(null, 'connection');
route.runtime = <AbbrRoute>router.bind(null, 'runtime');

export default route;
