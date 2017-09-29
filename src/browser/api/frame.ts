/*
Copyright 2017 OpenFin Inc.

Licensed under OpenFin Commercial License you may not use this file except in compliance with your Commercial License.
Please contact OpenFin Inc. at sales@openfin.co to obtain a Commercial License.
*/

import ofEvents from '../of_events';
import { Identity } from '../../shapes';
import route from '../../common/route';
const coreState = require('../core_state');
import * as log from '../log';
import * as Shapes from '../../shapes';

// enum EntityType {
//     window = 'window',
//     iframe = 'iframe',
//     externalConnection = 'external connection',
//     unknown = 'unknown'
// }

// type EntityType = 'window' | 'iframe' | 'external connection' | 'unknown';

// interface FrameInfo {
//     uuid: string;
//     name: string;
//     parent: shapes.Identity;
//     entityType: EntityType;
// }

class FrameInfo {
    public uuid: string = '';
    public name: string = '';
    public parent: Identity = {uuid: null, name: null};
    public entityType: Shapes.EntityType = 'unknown';

    constructor(frameInfo: FrameInfo = <FrameInfo>{}) {
        const {uuid, name, parent, entityType} = frameInfo;
        this.name = name || this.name;
        this.uuid = uuid || this.uuid;
        this.parent = parent || this.parent;
        this.entityType = entityType || this.entityType;
    }
}

export module Frame {
    export function addEventListener (identity: Identity, targetIdentity: Identity, type: string, listener: Function) {
        //  SAME AS WINDOW
        const eventString = route.frame(type, targetIdentity.uuid, targetIdentity.name);
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

        ofEvents.on(eventString, safeListener);

        unsubscribe = () => {
            ofEvents.removeListener(eventString, safeListener);
        };
        return unsubscribe;

    }

    export function removeEventListener (identity: Identity, type: string, listener: Function) {
        const browserFrame = coreState.getWindowByUuidName(identity.uuid, identity.name);

        ofEvents.removeListener(route.frame(type, browserFrame.id), listener);
    }

    export function getInfo (targetIdentity: Identity, message: any) {
        const frameInfo = coreState.getInfoByUuidFrame(targetIdentity);

        log.writeToLog(1, 'thennn', true);
        log.writeToLog(1, `go get ${JSON.stringify(frameInfo)}`, true);

        if (frameInfo) {
            return new FrameInfo(frameInfo);
        } else {
            return new FrameInfo(<FrameInfo>targetIdentity);
        }
    }
}
