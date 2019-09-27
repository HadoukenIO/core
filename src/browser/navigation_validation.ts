import * as coreState from './core_state';
import { BrowserWindow, app as electronApp } from 'electron';
import SubscriptionManager from './subscription_manager';
import ofEvents from './of_events';
import route from '../common/route';
import { isURLAllowed } from '../common/main';
import { Identity } from './api_protocol/transport_strategy/api_transport_base';

const subscriptionManager = new SubscriptionManager();

export function validateNavigation(webContents: any, identity: any, validator: (event: any, url: string) => any) {
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
    const navigationRules = options.contentNavigation;
    if (navigationRules) {
        const { blacklist, whitelist } = navigationRules;
        if (blacklist && blacklist.length) {
            isAllowed = !electronApp.matchesURL(url, blacklist);
        } else {
            isAllowed = electronApp.matchesURL(url, whitelist || ['<all_urls>']);
        }
    }
    return isAllowed;
}

function validateViewNavigation(url: string, identity: Identity): boolean {
    let isAllowed = true;
    const { _options = null, target = null, parent = null } = { ...coreState.getBrowserViewByIdentity(identity) };
    if (_options) {
        isAllowed = validateNavigationRules(url, _options);
        if (parent.entityType === 'view') {
            isAllowed = isAllowed && validateViewNavigation(url, parent);
        } else {
            const parentWin = coreState.getWindowByUuidName(parent.name, parent.uuid);
            if (parentWin) {
                isAllowed = isAllowed && validateWindowNavigation(url, parentWin.id);
            }
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

// accept _opts and _parentUuid to accomodate for applications in the creation process
export function validateApplicationNavigation(url: string, uuid: string, _opts?: any, _parentUuid?: string): boolean {
    let isAllowed = true;
    const { _options: options = _opts } = { ...coreState.getAppObjByUuid(uuid) };
    const { parentUuid = _parentUuid } = { ...coreState.appByUuid(uuid) };
    if (options) {
        isAllowed = validateNavigationRules(url, options) && validateApplicationNavigation(url, parentUuid);
    }
    return isAllowed;
}

export function navigationValidator(uuid: string, name: string, winId: number) {
    return (event: any, url: string) => {
        const isMailTo = /^mailto:/i.test(url);
        electronApp.vlog(1, `Validating navigation rules for ${uuid} to ${url}`);
        const allowed = isMailTo || isURLAllowed(url)
            && validateViewNavigation(url, { uuid, name })
            && validateWindowNavigation(url, winId)
            && validateApplicationNavigation(url, uuid);
        if (!allowed) {
            electronApp.vlog(1, 'Navigation is blocked ' + url);

            // sourceName is deprecated and will soon be removed
            const self = coreState.getWinById(winId);
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

            const isView = coreState.getInfoByUuidFrame({ uuid, name }).entityType === 'view';
            const routeFunc = isView ? route.view : route.window;
            const payload = isView ? {} : { sourceName };
            ofEvents.emit(routeFunc('navigation-rejected', uuid, name), {
                name,
                uuid,
                url,
                ...payload
            });

            event.preventDefault();
        }
    };
}
