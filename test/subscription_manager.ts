import * as assert from 'assert';
import SubscriptionManager from '../src/browser/subscription_manager';

let subscriptionManager: SubscriptionManager;
const listener = (): void => undefined;

describe('Subscription manager', () => {
    beforeEach(() => {
        subscriptionManager = new SubscriptionManager();
    });

    it('has all predefined methods', () => {
        let hasAllInstanceMethods = true;
        let hasAllPrototypeMethods = true;
        const instanceMethods = Object.getOwnPropertyNames(subscriptionManager);
        const prototypeMethods = Object.getOwnPropertyNames(SubscriptionManager.prototype);
        const knownInstanceMethods = [
            'subscriptionList',
            'subscriptionExists',
            'uppSubscriptionRefCount',
            'registerSubscription',
            'removeSubscription',
            'removeAllSubscriptions'
        ];
        const knownPrototypeMethods = [
            'constructor',
            'identityToKey',
            'genSubscriptionKey'
        ];

        // Check instance methods
        instanceMethods.forEach(method => {
            if (!knownInstanceMethods.find(e => e === method)) {
                hasAllInstanceMethods = false;
            }
        });

        // Check prototype methods
        prototypeMethods.forEach(method => {
            if (!knownPrototypeMethods.find(e => e === method)) {
                hasAllPrototypeMethods = false;
            }
        });

        assert(instanceMethods.length === knownInstanceMethods.length, 'different quantity of instance methods');
        assert(prototypeMethods.length === knownPrototypeMethods.length, 'different quantity of prototype methods');
        assert(hasAllInstanceMethods, 'has missing instance methods');
        assert(hasAllPrototypeMethods, 'has missing prototype methods');
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
