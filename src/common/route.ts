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

export type WindowRoute = (
    type: string,
    uuid?: string,
    name?: string,
    hyphenateUuidName?: boolean
) => string;

export type SimpleRoute = (
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

    application: SimpleRoute;
    externalApplication: SimpleRoute;
    'external-application': SimpleRoute;

    frame: WindowRoute;
    window: WindowRoute;
    externalWindow: WindowRoute;
    'external-window': WindowRoute;

    system: SimpleRoute;
    service: SimpleRoute;
    server: SimpleRoute;
    connection: SimpleRoute;
    runtime: SimpleRoute;

    rvmMessageBus: SimpleRoute;
    'rvm-message-bus': SimpleRoute;
}

interface Context { hyphenateUuidName: boolean; }
const HYPHEN: Context = { hyphenateUuidName: true };

// NOTE: Always called bound to a context; see .bind() calls below.
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
                // tslint:disable-next-line:no-invalid-this (`this` is the bound context)
                hyphenateUuidName = this && this.hyphenateUuidName;
            }
            result += hyphenateUuidName ? '-' : '/';
            result += subsubtopic;
        }
    }
    return result;
}

const route: Route = <Route>router.bind(null);

route.application = <SimpleRoute>route.bind(null, 'application');
route.externalApplication = route['external-application'] = <SimpleRoute>router.bind(null, 'external-application');

route.frame = <WindowRoute>router.bind(HYPHEN, 'frame');
route.window = <WindowRoute>router.bind(HYPHEN, 'window');
route.externalWindow = route['external-window'] = <WindowRoute>router.bind(HYPHEN, 'external-window');

route.service = <SimpleRoute>router.bind(null, 'service');
route.system = <SimpleRoute>router.bind(null, 'system');
route.rvmMessageBus = route['rvm-message-bus'] = <SimpleRoute>router.bind(null, 'rvm-message-bus');
route.server = <SimpleRoute>router.bind(null, 'server');
route.connection = <SimpleRoute>router.bind(null, 'connection');
route.runtime = <SimpleRoute>router.bind(null, 'runtime');

export default route;
