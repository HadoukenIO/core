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
import * as assert from 'assert';
import SubscriptionManager from '../src/browser/subscription_manager';

let subscriptionManager: SubscriptionManager;
const listener = (): void => undefined;

describe('Subscription manager', () => {
    beforeEach(() => {
        subscriptionManager = new SubscriptionManager();
    });

    it('has all predefined methods', () => {
        let hasAllMethods = true;
        const methods = Object.getOwnPropertyNames(SubscriptionManager.prototype);
        const knownMethods = [
            'constructor',
            'identityToKey',
            'genSubscriptionKey',
            'subscriptionExists',
            'uppSubscriptionRefCount',
            'registerSubscription',
            'removeSubscription',
            'removeAllSubscriptions'
        ];

        methods.forEach(method => {
            if (!knownMethods.find(e => e === method)) {
                hasAllMethods = false;
            }
        });

        assert(methods.length === knownMethods.length, 'different quantity');
        assert(hasAllMethods, 'has missing methods');
    });

    it('registers a subscription', () => {
        const identity = {uuid: 'uuid', name: 'name'};
        const args = ['arg1', 'arg2'];

        subscriptionManager.registerSubscription(listener, identity, ...args);

        const subExists = subscriptionManager.subscriptionExists(identity, ...args);

        assert(subExists, 'subscription not found after registration');
    });

    it('removes a subscription', () => {
        const identity = {uuid: 'uuid', name: 'name'};
        const args = ['arg1', 'arg2'];

        subscriptionManager.registerSubscription(listener, identity, ...args);
        subscriptionManager.removeSubscription(identity, ...args);

        const subExists = subscriptionManager.subscriptionExists(identity, ...args);

        assert(!subExists, 'subscription was not removed');
    });

    it('removes all subscriptions', () => {
        const identity = {uuid: 'uuid', name: 'name'};
        const args1 = ['arg11', 'arg12'];
        const args2 = ['arg21', 'arg22'];

        subscriptionManager.registerSubscription(listener, identity, ...args1);
        subscriptionManager.registerSubscription(listener, identity, ...args2);
        subscriptionManager.removeAllSubscriptions(identity);

        const sub1Exists = subscriptionManager.subscriptionExists(identity, ...args1);
        const sub2Exists = subscriptionManager.subscriptionExists(identity, ...args2);

        assert(!sub1Exists && !sub2Exists, 'not all subscriptions were removed');
    });
});
