/*
Copyright 2017 OpenFin Inc.

Licensed under OpenFin Commercial License you may not use this file except in compliance with your Commercial License.
Please contact OpenFin Inc. at sales@openfin.co to obtain a Commercial License.
*/

//import ofEvents from '../../../browser/of_events';
import * as apiProtocolBase from './api_protocol_base';

import { ExternalApplication } from '../../api/external_application';
import { Identity } from '../../../shapes';
import { ActionMap } from '../transport_strategy/api_transport_base';

export class ExternalApplicationApiHandler {
    private readonly actionMap: ActionMap = {
        'get-external-application-info': this.getInfo
    };

    constructor() {
        apiProtocolBase.registerActionMap(this.actionMap);
    }

    private getInfo(source: Identity, message: any) {
        return ExternalApplication.getInfo(message.payload);
    }
}