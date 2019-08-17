const coreState = require('./core_state');
import { BrowserWindow, app as electronApp } from 'electron';
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
export function validateNavigationRules(url: string, options: any): boolean {
    let isAllowed = true;
    if (options.contentNavigation) {
        if (options.contentNavigation.blacklist.length) {
            isAllowed = !electronApp.matchesURL(url, options.contentNavigation.blacklist);
        } else {
            isAllowed = electronApp.matchesURL(url, options.contentNavigation.whitelist);
        }
    }
    return isAllowed;
}

function validateWindowNavigation(url: string, windowId: number): boolean {
    let isAllowed = true;
    const { openfinWindow = null, parentId = null } = { ...coreState.getWinById(windowId) };
    if (openfinWindow) {
        isAllowed = validateNavigationRules(url, openfinWindow._options) && validateWindowNavigation(url, parentId);
    }
    return isAllowed;
}

function validateApplicationNavigation(url: string, uuid: string): boolean {
    let isAllowed = true;
    const appObject = coreState.getAppObjByUuid(uuid);
    const appMetaInfo = coreState.appByUuid(uuid);
    if (appObject) {
        isAllowed = validateNavigationRules(url, appObject._options) && validateApplicationNavigation(url, appMetaInfo.parentUuid);
    }
    return isAllowed;
}

export function navigationValidator(uuid: string, name: string, id: number) {
    return (event: any, url: string) => {
        const isMailTo = /^mailto:/i.test(url);
        electronApp.vlog(1, `Validating navigation rules for ${uuid} to ${url}`);
        const allowed = isMailTo || validateWindowNavigation(url, id) && validateApplicationNavigation(url, uuid) &&
                                    isURLAllowed(url);
        if (!allowed) {
            electronApp.vlog(1, 'Navigation is blocked ' + url);
            const self = coreState.getWinById(id);
            const webContents = BrowserWindow.fromId(id);
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
