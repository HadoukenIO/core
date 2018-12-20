
import { EventEmitter } from 'events';
export let lastVlogValue = '';
export let lastLogValue = '';

const hotkeyEmitter = new EventEmitter();

class BrowserWindow  {
    // tslint:disable-next-line
    static fromWebContents(id: any): BrowserWindow {
        return new BrowserWindow();
    }

    public id = 2;

    public close(): void { return; }
}

export const mockElectron = {
    app: {
        generateGUID: () => 'some unique value',
        vlog: (level: number, val: string) => {
            lastVlogValue = val;
        },
        log: (level: string, val: string) => {
            lastLogValue = val;
        },
        getCommandLineArguments: (): any => {
            return '';
        },
        getCommandLineArgv: (): any => {
            return [];
        },
        nowFromSystemTime: (): number => {
            return Date.now();
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
    },
    BrowserWindow: BrowserWindow
};
