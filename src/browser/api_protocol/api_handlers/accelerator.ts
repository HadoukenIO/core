/*
Copyright 2018 OpenFin Inc.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import * as apiProtocolBase from './api_protocol_base';

import { Accelerator } from '../../api/accelerator';
import { Identity } from '../../../shapes';
import { ActionSpecMap } from '../shapes';
import * as log from '../../log';

const successAck = {
    success: true
};

export class AcceleratorApiHandler {
    private readonly actionMap: ActionSpecMap = {
        'global-accelerator-register': this.register,
        'global-accelerator-unregister': this.unregister,
        'global-accelerator-unregister-all': this.unregisterAll,
        'global-accelerator-is-registered': this.isRegistered
    };

    constructor() {
        apiProtocolBase.registerActionMap(this.actionMap);
    }

    //we will leverage the process-desktop-event pipeline without leveraging existing subscribe/unsubscribe logic
    //this subscription claims the accelerator.
    private async register(source: Identity, message: any) {
        const { uuid, name } = source;
        const { accelerator } = message.payload;
            Accelerator.register(source, accelerator, () => {
                const eventObj = {
                    action: 'process-desktop-event',
                    payload: {
                        topic: 'accelerator',
                        type: accelerator

                    }
                };

                apiProtocolBase.sendToIdentity(source, eventObj);
            });
        return successAck;
    }

    private async unregister(source: Identity, message: any) {
        const { uuid, name } = source;
        const { accelerator } = message.payload;
        Accelerator.unregister(source, accelerator);

        return successAck;
    }

    private async unregisterAll(source: Identity, message: any) {
        Accelerator.unregisterAll(source);

        return successAck;
    }

    private async isRegistered(source: Identity, message: any) {
        const { accelerator } = message.payload;

        return Accelerator.isRegistered(accelerator);
    }

}
