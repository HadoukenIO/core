const coreState = require('./core_state');
const electronApp = require('electron').app;
import SubscriptionManager from './subscription_manager';
import ofEvents from './of_events';
import route from '../common/route';
import { isURLAllowed } from '../common/main';

const subscriptionManager = new SubscriptionManager();

export function validateNavigation(webContents: any, identity: any, validator: () => any) {
    const willNavigateString = 'will-navigate';

    webContents.on(willNavigateString, validator);

    const willNavigateUnsubscribe = () => {
        webContents.removeListener(willNavigateString, validator);
    };
    subscriptionManager.registerSubscription(willNavigateUnsubscribe, identity, willNavigateString);
}

// check rules for all ancestors. returns false if rejected by any ancestor's rules
export function validateNavigationRules(uuid: string, url: string, parentUuid: string, baseOpts: any): boolean {
    electronApp.vlog(1, `validateNavigationRules for ${uuid} to ${url}`);
    let isAllowed = true;
    if (baseOpts.contentNavigation) {
        if (baseOpts.contentNavigation.whitelist) {
            isAllowed = electronApp.matchesURL(url, baseOpts.contentNavigation.whitelist);
        } else if (baseOpts.contentNavigation.blacklist) {
            isAllowed = !electronApp.matchesURL(url, baseOpts.contentNavigation.blacklist);
        }
    }
    if (!isAllowed) {
        electronApp.vlog(1, `Navigation is blocked by rules for ${baseOpts.uuid} to ${url}`);
        return false;
    } else if (parentUuid) {
        electronApp.vlog(1, `validateNavigationRules app ${uuid} check parent ${parentUuid}`);
        const parentObject = coreState.appByUuid(parentUuid);
        if (parentObject && parentObject.isRunning) {
            const parentOpts = parentObject.appObj._options;
            isAllowed = validateNavigationRules(uuid, url, parentObject.parentUuid, parentOpts);
        } else {
            electronApp.vlog(1, `validateNavigationRules missing parent ${parentUuid}`);
        }
    } else {
        electronApp.vlog(1, `validateNavigationRules no parent ${uuid}`);
    }
    return isAllowed;
}

export function navigationValidator(uuid: string, name: string, id: number) {
    return (event: any, url: string) => {
        const appObject = coreState.getAppObjByUuid(uuid);
        const appMetaInfo = coreState.appByUuid(uuid);
        const isMailTo = /^mailto:/i.test(url);
        const allowed = isMailTo || validateNavigationRules(uuid, url, appMetaInfo.parentUuid, appObject._options) &&
                                    isURLAllowed(url);
        if (!allowed) {
            electronApp.vlog(1, 'Navigation is blocked ' + url);
            const self = coreState.getWinById(id);
            let sourceName = name;
            if (self.parentId) {
                const parent = coreState.getWinById(self.parentId);
                if (parent) {
                    const parentOpts = coreState.getWindowOptionsById(parent.id);
                    if (parentOpts) {
                        sourceName = parentOpts.name;
                    }
                }
            }
            ofEvents.emit(route.window('navigation-rejected', uuid, name), {
                name,
                uuid,
                url,
                sourceName
            });
            event.preventDefault();
        }
    };
}
