
import * as apiProtocolBase from './api_protocol_base';

import { ExternalApplication } from '../../api/external_application';
import { Identity } from '../../../shapes';
import { ActionSpecMap } from '../shapes';

export class ExternalApplicationApiHandler {
    private readonly actionMap: ActionSpecMap = {
        'get-external-application-info': this.getInfo
    };

    constructor() {
        apiProtocolBase.registerActionMap(this.actionMap);
    }

    private getInfo(source: Identity, message: any) {
        return ExternalApplication.getInfo(message.payload);
    }
}
