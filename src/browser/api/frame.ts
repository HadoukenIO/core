/*
Copyright 2017 OpenFin Inc.

Licensed under OpenFin Commercial License you may not use this file except in compliance with your Commercial License.
Please contact OpenFin Inc. at sales@openfin.co to obtain a Commercial License.
*/

import ofEvents from '../of_events';
import { Identity } from '../../shapes';
import route from '../../common/route';
const coreState = require('../../core_state');


export module Frame {
    export function addEventListener (identity: Identity, targetIdentity: Identity, type: string, listener: Function) {
        //  SAME AS WINDOW
        const eventString = route.window(type, targetIdentity.uuid, targetIdentity.name);
        const errRegex = /^Attempting to call a function in a renderer frame that has been closed or released/;

        let unsubscribe;
        let browserWinIsDead;

        const safeListener = (...args: any[]) => {

            try {

                listener.call(null, ...args);

            } catch (err) {

                browserWinIsDead = errRegex.test(err.message);

                // if we error the browser frame that this used to reference
                // has been destroyed, just remove the listener
                if (browserWinIsDead) {
                    ofEvents.removeListener(eventString, safeListener);
                }
            }
        };

        // electronApp.vlog(1, `addEventListener ${eventString}`);
        ofEvents.on(eventString, safeListener);

        unsubscribe = () => {
            ofEvents.removeListener(eventString, safeListener);
        };
        return unsubscribe;

    }

    export function removeEventListener (identity: Identity, type: string, listener: Function) {
        const browserFrame = coreState.getWindowByUuidName(identity.uuid, identity.name);
        // const browserFrame = getElectronBrowserWindow(identity, 'remove event listener for');
        ofEvents.removeListener(route.frame(type, browserFrame.id), listener);
    }

    export function getInfo (Frame: Identity) {
        return 'getInfo in api/frame from core - FILL ME IN>>>>>>>>>';
    }
}
