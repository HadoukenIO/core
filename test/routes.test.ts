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

import route, { Route, SimpleRoute, WindowRoute } from '../src/common/route';
import * as assert from 'assert';

describe('route', () => {
    it('Should be a function', () => {
        assert.equal(typeof route, 'function');
    });

    it('When called with 2 params, should return channel/topic', () => {
        assert.equal(route('channel', 'topic'), 'channel/topic');
    });

    it('When called with 3 params, should return channel/topic/subtopic', () => {
        assert.equal(route('channel', 'topic', 'subtopic'), 'channel/topic/subtopic');
    });

    it('When called with 4 params, should return channel/topic/subtopic/subsubtopic', () => {
        assert.equal(route('channel', 'topic', 'subtopic', 'subsubtopic'), 'channel/topic/subtopic/subsubtopic');
    });

    it('When called with 4 string params and 5th param = false, should return channel/topic/subtopic/subsubtopic', () => {
        assert.equal(route('channel', 'topic', 'subtopic', 'subsubtopic', false), 'channel/topic/subtopic/subsubtopic');
    });

    it('When called with 4 string params and 5th param = true, should return channel/topic/subtopic-subsubtopic', () => {
        assert.equal(route('channel', 'topic', 'subtopic', 'subsubtopic', true), 'channel/topic/subtopic-subsubtopic');
    });
});

shouldBeAbbrFunc('application');
shouldBeAbbrFunc('externalApplication', 'external-application');
shouldBeAbbrFunc('external-application');

shouldBeWindowFunc('window');
shouldBeWindowFunc('externalWindow', 'external-window');
shouldBeWindowFunc('external-window');

shouldBeAbbrFunc('system');
shouldBeAbbrFunc('server');
shouldBeAbbrFunc('connection');
shouldBeAbbrFunc('runtime');

shouldBeAbbrFunc('rvmMessageBus', 'rvm-message-bus');
shouldBeAbbrFunc('rvm-message-bus');

interface SimpleRouteDict extends Route {
    [funcName: string]: SimpleRoute;
}

function shouldBeAbbrFunc(funcName: string, apiName?: string): void {
    const abbrRoute: SimpleRoute = (<SimpleRouteDict>route)[funcName];

    apiName = apiName || funcName;

    describe(/\W/.test(funcName) ? `route['${funcName}']` : `route.${funcName}`, () => {
        it('Should be a function', () => {
            assert.equal(typeof abbrRoute, 'function');
        });

        it('When called with all 3 string params, should return channel/topic/subtopic/subsubtopic', () => {
            assert.equal(abbrRoute('topic', 'subtopic', 'subsubtopic'), apiName + '/topic/subtopic/subsubtopic');
        });
    });
}

interface WindowRouteDict extends Route {
    [funcName: string]: WindowRoute;
}

function shouldBeWindowFunc(funcName: string, apiName?: string): void {
    const windowRoute: WindowRoute = (<WindowRouteDict>route)[funcName];

    apiName = apiName || funcName;

    describe(/\W/.test(funcName) ? `route['${funcName}']` : `route.${funcName}`, () => {
        it('Should be a function', () => {
            assert.equal(typeof windowRoute, 'function');
        });

        it('When called with 3 string params and 4th param omitted, should return channel/topic/subtopic-subsubtopic', () => {
            assert.equal(windowRoute('topic', 'subtopic', 'subsubtopic'), apiName + '/topic/subtopic-subsubtopic');
        });

        it('When called with 3 string params and 4th param = false, should return channel/topic/subtopic/subsubtopic', () => {
            assert.equal(windowRoute('topic', 'subtopic', 'subsubtopic', false), apiName + '/topic/subtopic/subsubtopic');
        });

        it('When called with 3 string params and 4th param = true, should return channel/topic/subtopic-subsubtopic', () => {
            assert.equal(windowRoute('topic', 'subtopic', 'subsubtopic', true), apiName + '/topic/subtopic-subsubtopic');
        });
    });
}
