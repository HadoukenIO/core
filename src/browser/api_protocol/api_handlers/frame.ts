import * as apiProtocolBase from './api_protocol_base';
import { ActionSpecMap } from '../shapes';
import { Frame } from '../../api/frame';
import { Identity } from '../../../shapes';

const successAck: object = {
    success: true
};

export class FrameApiHandler {
    private readonly actionMap: ActionSpecMap = {
        'get-frame-info': this.getInfo,
        'get-parent-window': this.getParentWindow
    };

    constructor() {
        apiProtocolBase.registerActionMap(this.actionMap);
    }

    private getInfo(identity: Identity, message: any) {
        const frameIdentity: Identity = apiProtocolBase.getTargetWindowIdentity(message.payload);

        return Frame.getInfo(frameIdentity);
    }

    private getParentWindow(identity: Identity) {
        return Frame.getParentWindow(identity);
    }
}
