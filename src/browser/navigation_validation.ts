/*
Copyright 2018 OpenFin Inc.

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
const coreState = require('./core_state');
const electronApp = require('electron').app;
import SubscriptionManager from './subscription_manager';
import ofEvents from './of_events';
import route from '../common/route';

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
        const allowed = isMailTo || validateNavigationRules(uuid, url, appMetaInfo.parentUuid, appObject._options);
        if (!allowed) {
            electronApp.vlog(1, 'Navigation is blocked ' + url, true);
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
