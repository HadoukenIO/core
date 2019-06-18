import * as apiProtocolBase from './api_protocol_base';
import { ActionSpecMap } from '../shapes';
import { Channel } from '../../api/channel';
import { Identity, APIMessage, ProviderIdentity } from '../../../shapes';
import { AckFunc, NackFunc } from '../transport_strategy/ack';
import * as browser_view from '../../api/browser_view';
import { getBrowserViewByIdentity } from '../../core_state';

const successAck = {
    success: true
};

function create (identity: Identity, message: APIMessage, ack: AckFunc) {
    const { payload } = message;
    browser_view.create(payload);
    ack(successAck);
}
async function attach (identity: Identity, message: APIMessage, ack: AckFunc) {
    const { payload } = message;
    const { uuid, name, target } = payload;
    const view = getBrowserViewByIdentity({uuid, name});
    await browser_view.attach(view, target);
    ack(successAck);
}
function setBounds (identity: Identity, message: APIMessage, ack: AckFunc) {
    const { payload } = message;
    const { uuid, name, bounds } = payload;
    const view = getBrowserViewByIdentity({uuid, name});
    browser_view.setBounds(view, bounds);
}
async function getInfo(identity: Identity, message: APIMessage, ack: AckFunc) {
    const { payload } = message;
    const { uuid, name } = payload;
    const view = getBrowserViewByIdentity({ uuid, name });
    return browser_view.getInfo(view);
}
export const browserViewActionMap: ActionSpecMap = {
    'create-browser-view': create,
    'attach-browser-view': attach,
    'set-browser-view-bounds': setBounds,
    'get-browser-view-info': getInfo
};

export function init() {
    apiProtocolBase.registerActionMap(browserViewActionMap);
}