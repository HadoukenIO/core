/*
Copyright 2017 OpenFin Inc.

Licensed under OpenFin Commercial License you may not use this file except in compliance with your Commercial License.
Please contact OpenFin Inc. at sales@openfin.co to obtain a Commercial License.
*/

import ofEvents from '../of_events';
import { Identity } from '../../shapes';
import route from '../../common/route';

export module Frame {
    export function addEventListener (identity: Identity, type: string, listener: Function) {
        const evt = route.frame(type, identity.uuid, identity.name);
        ofEvents.on(evt, listener);

        return () => {
            ofEvents.removeListener(evt, listener);
        };
    }

    export function removeEventListener (identity: Identity, type: string, listener: Function) {
        ofEvents.removeListener(route.frame(type, identity.uuid, identity.name), listener);
    }

    export function getInfo (Frame: Identity) {
        return 'getInfo in api/frame from core - FILL ME IN>>>>>>>>>';
    }
}


// Window.addEventListener = function(identity, targetIdentity, type, listener) {

//     let eventString = route.window(type, targetIdentity.uuid, targetIdentity.name);
//     let errRegex = /^Attempting to call a function in a renderer window that has been closed or released/;

//     let unsubscribe, safeListener, browserWinIsDead;

//     safeListener = (...args) => {

//         try {

//             listener.call(null, ...args);

//         } catch (err) {

//             browserWinIsDead = errRegex.test(err.message);

//             // if we error the browser window that this used to reference
//             // has been destroyed, just remove the listener
//             if (browserWinIsDead) {
//                 ofEvents.removeListener(eventString, safeListener);
//             }
//         }
//     };

//     electronApp.vlog(1, `addEventListener ${eventString}`);
//     ofEvents.on(eventString, safeListener);

//     unsubscribe = () => {
//         ofEvents.removeListener(eventString, safeListener);
//     };
//     return unsubscribe;
// };