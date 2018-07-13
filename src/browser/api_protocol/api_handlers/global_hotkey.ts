
import * as apiProtocolBase from './api_protocol_base';

import { GlobalHotkey } from '../../api/global_hotkey';
import { Identity } from '../../../shapes';
import { ActionSpecMap } from '../shapes';

const successAck = {
    success: true
};

const PROCESS_DESKTOP_EVENT = 'process-desktop-event';
const EVENT_TOPIC = 'global-hotkey';

export class GlobalHotkeyApiHandler {
    private readonly actionMap: ActionSpecMap = {
        'global-hotkey-is-registered': this.isRegistered,
        'global-hotkey-register': this.register,
        'global-hotkey-unregister': this.unregister,
        'global-hotkey-unregister-all': this.unregisterAll
    };

    constructor() {
        apiProtocolBase.registerActionMap(this.actionMap);
    }

    //we will leverage the process-desktop-event pipeline without leveraging existing subscribe/unsubscribe logic
    //this subscription claims the accelerator.
    private register(source: Identity, message: any) {
        const { uuid, name } = source;
        const { hotkey } = message.payload;
            GlobalHotkey.register(source, hotkey, () => {
                const eventObj = {
                    action: PROCESS_DESKTOP_EVENT,
                    payload: {
                        topic: EVENT_TOPIC,
                        type: hotkey

                    }
                };

                apiProtocolBase.sendToIdentity(source, eventObj);
            });
        return successAck;
    }

    private unregister(source: Identity, message: any) {
        const { uuid, name } = source;
        const { hotkey } = message.payload;
        GlobalHotkey.unregister(source, hotkey);

        return successAck;
    }

    private unregisterAll(source: Identity, message: any) {
        GlobalHotkey.unregisterAll(source);

        return successAck;
    }

    private isRegistered(source: Identity, message: any) {
        const { hotkey } = message.payload;

        return GlobalHotkey.isRegistered(hotkey);
    }

}
