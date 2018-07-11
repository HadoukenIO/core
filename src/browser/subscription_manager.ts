import ofEvents from './of_events';
import route from '../common/route';
import { Identity } from '../shapes';

interface Subscription {
    fn: () => void;
    refCount: number;
}

export default class SubscriptionManager {
    private subscriptionList: Map<string, Map<string, Subscription>>;

    constructor() {
        this.subscriptionList = new Map();

        ofEvents.on(route.window('closed'), (identity: Identity) => {
            this.removeAllSubscriptions(identity);
        });

        ofEvents.on(route('externalconn', 'closed'), (identity: Identity) => {
            this.removeAllSubscriptions({uuid: identity.uuid, name: identity.uuid});
        });

        ofEvents.on(route.frame('disconnected'), (identity: Identity) => {
            this.removeAllSubscriptions(identity);
        });
    }

    private identityToKey(identity: Identity): string {
        return encodeURIComponent(`${identity.uuid}/${identity.name}`);
    }

    private genSubscriptionKey(...args: any[]): string {
        const stringArgs = args.reduce((prev, curr) => `${curr}${prev}`);
        return encodeURIComponent(stringArgs);
    }

    public subscriptionExists = (identity: Identity, ...args: any[]): boolean => {
        const key = this.genSubscriptionKey.apply(null, args);
        const identityKey = this.identityToKey(identity);
        const identitySubs = this.subscriptionList.get(identityKey);

        return !!identitySubs && identitySubs.has(key);
    };

    public uppSubscriptionRefCount = (identity: Identity, ...args: any[]): void => {
        const key = this.genSubscriptionKey.apply(null, args);
        const identityKey = this.identityToKey(identity);

        this.subscriptionList.get(identityKey).get(key).refCount++;
    };

    public registerSubscription = (fn: () => void, identity: Identity, ...args: any[]): void => {
        const key = this.genSubscriptionKey.apply(null, args);
        const identityKey = this.identityToKey(identity);

        if (!this.subscriptionList.has(identityKey)) {
            this.subscriptionList.set(identityKey, new Map());
        }

        this.subscriptionList.get(identityKey).set(key, {fn, refCount: 1});
    };

    public removeSubscription = (identity: Identity, ...args: any[]): void => {
        const key = this.genSubscriptionKey.apply(null, args);
        const identityKey = this.identityToKey(identity);
        const identitySubs = this.subscriptionList.get(identityKey);
        const subscription = identitySubs && identitySubs.get(key);

        if (!subscription) {
            return;
        }

        subscription.refCount -= 1;

        if (subscription.refCount <= 0) {
            subscription.fn();
            identitySubs.delete(key);
        }
    };

    public removeAllSubscriptions = (identity: Identity): void => {
        const identityKey = this.identityToKey(identity);
        const identitySubs = this.subscriptionList.get(identityKey);

        if (identitySubs) {
            identitySubs.forEach((sub: Subscription) => {
                if (typeof sub.fn === 'function') {
                    sub.fn.call(null);
                }
            });
        }

        this.subscriptionList.delete(identityKey);
    };
}
