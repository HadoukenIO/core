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
var _ = require('underscore');
import ofEvents from './of_events';
import route from '../common/route';

function SubscriptionManager() {
    var subscriptionList = new Map();

    function identityToKey(identity) {
        return encodeURIComponent(`${identity.uuid}/${identity.name}`);
    }

    function genSubscriptionKey(...args) {
        return encodeURIComponent(args.reduce((prev, curr) => {
            return '' + curr + prev;
        }));
    }

    function subscriptionExists(identity, ...args) {
        let key = genSubscriptionKey.apply(null, args),
            identityKey = identityToKey(identity);

        return subscriptionList.has(identityKey) && subscriptionList.get(identityKey).has(key);
    }

    function uppSubscriptionRefCount(identity, ...args) {
        let key = genSubscriptionKey.apply(null, args),
            identityKey = identityToKey(identity);

        subscriptionList.get(identityKey).get(key).refCount++;
    }

    function registerSubscription(fn, identity, ...args) {
        let key = genSubscriptionKey.apply(null, args),
            identityKey = identityToKey(identity);

        if (!subscriptionList.has(identityKey)) {
            subscriptionList.set(identityKey, new Map());
        }

        subscriptionList.get(identityKey).set(key, {
            fn,
            refCount: 1
        });
    }

    function removeSubscription(identity, ...args) {
        let key = genSubscriptionKey.apply(null, args),
            identityKey = identityToKey(identity),
            subscription = subscriptionList.get(identityKey).get(key);

        subscription.refCount--;
        if (subscription.refCount <= 0) {
            subscription.fn.call();
            subscriptionList.get(identityKey).delete(key);
        }
    }

    function removeAllSubscriptions(identity) {
        let identityKey = identityToKey(identity);

        if (subscriptionList.has(identityKey)) {
            //unsubscribe from all
            for (var [key, value] of subscriptionList.get(identityKey).entries()) {
                if (_.isFunction(value.fn)) {
                    value.fn.call(null);
                }
                subscriptionList.get(identityKey).delete(key);
            }
        }
        subscriptionList.delete(identityKey);
    }

    ofEvents.on(route.window('closed'), identity => {
        removeAllSubscriptions(identity);
    });

    ofEvents.on(route('externalconn', 'closed'), identity => {
        removeAllSubscriptions(identity);
    });

    return {
        subscriptionExists,
        uppSubscriptionRefCount,
        registerSubscription,
        removeSubscription,
        removeAllSubscriptions
    };
}

module.exports.SubscriptionManager = SubscriptionManager;
