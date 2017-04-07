/*
Copyright 2017 OpenFin Inc.

Licensed under OpenFin Commercial License you may not use this file except in compliance with your Commercial License.
Please contact OpenFin Inc. at sales@openfin.co to obtain a Commercial License.
*/

//import ofEvents from '../../../browser/of_events';
import * as apiProtocolBase from './api_protocol_base';

import { Identity } from '../../../shapes';
import { ActionMap } from '../transport_strategy/api_transport_base';

export class ExternalApplicationHandler {
    private readonly actionMap: ActionMap = {
        'create-external-application': this.create,
        'get-external-application-parent': this.getParent,
        'get-external-application-info': this.getInfo,
        'terminate-external-application': this.terminate
    };

    constructor() {
        apiProtocolBase.registerActionMap(this.actionMap);
    }

    private create(identity: Identity) {
        return;
    }

    private getParent(identity: Identity) {
        return;
    }

    private getInfo(identity: Identity) {
        return;
    }

    private terminate(identity: Identity) {
        return;
    }
}