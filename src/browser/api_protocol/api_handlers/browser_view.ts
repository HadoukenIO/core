import * as apiProtocolBase from './api_protocol_base';
import { ActionSpecMap } from '../shapes';
import { Identity, APIMessage } from '../../../shapes';
import * as browser_view from '../../api/browser_view';
import { getBrowserViewByIdentity } from '../../core_state';

const successAck = {
    success: true
};

async function create (identity: Identity, message: APIMessage) {
    const { payload } = message;
    await browser_view.create(payload);
    return successAck;
}
async function attach (identity: Identity, message: APIMessage) {
    const { payload } = message;
    const { uuid, name, target } = payload;
    const view = getBrowserViewByIdentity({uuid, name});
    await browser_view.attach(view, target);
    return successAck;
}
async function setBounds (identity: Identity, message: APIMessage) {
    const { payload } = message;
    const { uuid, name, bounds } = payload;
    const view = getBrowserViewByIdentity({uuid, name});
    browser_view.setBounds(view, bounds);
    return successAck;
}
async function getInfo(identity: Identity, message: APIMessage) {
    const { payload } = message;
    const { uuid, name } = payload;
    const view = getBrowserViewByIdentity({ uuid, name });
    return browser_view.getInfo(view);
}
async function show(identity: Identity, message: APIMessage) {
    const { payload } = message;
    const { uuid, name } = payload;
    const view = getBrowserViewByIdentity({ uuid, name });
    await browser_view.show(view);
    return successAck;
} async function hide(identity: Identity, message: APIMessage) {
    const { payload } = message;
    const { uuid, name } = payload;
    const view = getBrowserViewByIdentity({ uuid, name });
    await browser_view.hide(view);
    return successAck;
}
export const browserViewActionMap: ActionSpecMap = {
    'create-browser-view': create,
    'attach-browser-view': attach,
    'set-browser-view-bounds': setBounds,
    'get-browser-view-info': getInfo,
    'hide-browser-view': hide,
    'show-browser-view': show
};

export function init() {
    apiProtocolBase.registerActionMap(browserViewActionMap);
}