import * as apiProtocolBase from './api_protocol_base';
import { ActionSpecMap } from '../shapes';
import { Channel } from '../../api/channel';
import { Identity, APIMessage, ProviderIdentity } from '../../../shapes';
import { AckFunc, NackFunc } from '../transport_strategy/ack';
import { create, attach } from '../../api/browser_view';

const successAck = {
    success: true
};

export class BrowserViewApiHandler {

    constructor() {
        apiProtocolBase.registerActionMap(this.actionMap);
    }
    private create = (identity: Identity, message: APIMessage, ack: AckFunc) => {
        const { payload } = message;
        create(payload);
        ack(successAck);
    }
    private attach = (identity: Identity, message: APIMessage, ack: AckFunc) => {
        const { payload } = message;
        const {source, target} = payload;
        attach(source, target);
        ack(successAck);
    }
    private readonly actionMap: ActionSpecMap = {
        'create-browser-view': this.create,
         'attach-browser-view': this.attach
    };

}
