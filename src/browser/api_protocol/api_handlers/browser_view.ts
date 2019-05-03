import * as apiProtocolBase from './api_protocol_base';
import { ActionSpecMap } from '../shapes';
import { Channel } from '../../api/channel';
import { Identity, APIMessage, ProviderIdentity } from '../../../shapes';
import { AckFunc, NackFunc } from '../transport_strategy/ack';
import { create, attach, setBounds } from '../../api/browser_view';

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
        const {uuid, name, target} = payload;
        attach({uuid, name}, target);
        ack(successAck);
    }
    private setBounds = (identity: Identity, message: APIMessage, ack: AckFunc) => {
        const { payload } = message;
        const { uuid, name, bounds } = payload;
        setBounds({uuid, name}, bounds);
    }
    private readonly actionMap: ActionSpecMap = {
        'create-browser-view': this.create,
        'attach-browser-view': this.attach,
        'set-browser-view-bounds': this.setBounds
    };

}
