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
let coreState = require('./core_state.js');
let electronApp = require('electron').app;
let SubScriptionManager:any = require('./subscription_manager.js').SubscriptionManager;
let subScriptionManager:any = new SubScriptionManager();

import ofEvents from "./of_events";

export function validateNavigation(webContents: any, identity:any, validator: () => any) {
    let willNavigateString = 'will-navigate';

    webContents.on(willNavigateString, validator);

    let willNavigateUnsubscribe = () => {
        webContents.removeListener(willNavigateString, validator);
    };
    subScriptionManager.registerSubscription(willNavigateUnsubscribe, identity, willNavigateString);
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
        let parentObject = coreState.getAppObjByUuid(parentUuid);
        if (parentObject) {
            let parentOpts = parentObject._options;
            isAllowed = validateNavigationRules(uuid, url, parentObject.parentUuid,parentOpts);
        } else {
            electronApp.vlog(1, `validateNavigationRules missing parent ${parentUuid}`);
        }
    } else {
        electronApp.vlog(1, `validateNavigationRules no parent ${uuid}`);
    }
    return isAllowed;
}

export function navigationValidator(uuid: string, name:string, id: number) {
    const uuidname = `${uuid}-${name}`;
    return (event: any, url: string) => {
        let appObject = coreState.getAppObjByUuid(uuid);
        let allowed = validateNavigationRules(uuid, url, appObject.parentUuid, appObject._options);
        if (allowed === false) {
            console.log('Navigation is blocked ' + url);
            let self = coreState.getWinById(id);
            let sourceName = name;
            if (self.parentId) {
                let parent = coreState.getWinById(self.parentId);
                if (parent) {
                    let parentOpts = coreState.getWindowOptionsById(parent.id);
                    if (parentOpts) {
                        sourceName = parentOpts.name;
                    }
                }
            }
            ofEvents.emit(`window/navigation-rejected/${uuidname}`, {
                name,
                uuid,
                url,
                sourceName
            });
            ofEvents.emit(`application/window-navigation-rejected/${uuid}`, {
                name,
                uuid,
                url,
                sourceName
            });
            event.preventDefault();
        } else {
        }
    };
}
