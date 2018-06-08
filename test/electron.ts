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

import { EventEmitter } from 'events';
export let lastVlogValue = '';
export let lastLogValue = '';

const hotkeyEmitter = new EventEmitter();

export const mockElectron = {
    app: {
        generateGUID: () => 'some unique value',
        vlog: (level: number, val: string) => {
            lastVlogValue = val;
        },
        log: (level: string, val: string) => {
            lastLogValue = val;
        }
    },
    globalShortcut: {
        isRegistered: (accelerator: string) => {
            return (hotkeyEmitter.listenerCount(accelerator) > 0);
        },
        register: (accelerator: string, listener: any) => {
            if (mockElectron.globalShortcut.failNextRegisterCall) {
                mockElectron.globalShortcut.failNextRegisterCall = false;
                return;
            } else {
                return hotkeyEmitter.on(accelerator, listener);
            }
        },
        unregisterAll: () => {
            hotkeyEmitter.removeAllListeners();
        },
        unregister: (accelerator: string) => {
            hotkeyEmitter.removeAllListeners(accelerator);
        },
        mockRaiseEvent: (accelerator: string) => {
            hotkeyEmitter.emit(accelerator);
        },
        failNextRegisterCall : false
    }
};
