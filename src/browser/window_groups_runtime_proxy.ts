//This module is responsible for :
// a) Producing and maintaining proxy Browser windows owned by another runtime.
// b) Keeping window group state cross runtimes

import { BrowserWindow as BrowserWindowElectron } from 'electron';
import { OpenFinWindow, Identity, BrowserWindow, ChildFrameInfo, PreloadScriptState } from '../shapes';
import { default as connectionManager, PeerRuntime } from './connection_manager';
import * as coreState from './core_state';
import { _Window } from '../../js-adapter/src/api/window/window';
import { EventEmitter } from 'events';
import { writeToLog } from './log';
import { WindowGroupChanged, WindowOptionsChangedEvent} from '../../js-adapter/src/api/events/window';
import { argo } from './core_state';
import { WindowOption } from '../../js-adapter/src/api/window/windowOption';

//Only allow window proxies to >=.35 runtimes.
const MIN_API_VER = 37;
class MyEmitter extends EventEmitter {}
const externalWindowsProxyList = new Map<string, RuntimeProxyWindow>();

export const groupProxyEvents = new MyEmitter();

function getWindowKey(identity: Identity) {
    return `${identity.uuid}${identity.name}`;
}

export interface GroupProxyChange {
    action: 'add' | 'remove';
    targetIdentity: Identity;
    window: OpenFinWindow;
    sourceIdentity: Identity;
    sourceGroup: Array<any>;
}

export class RuntimeProxyWindow {
    public hostRuntime: PeerRuntime;
    public window: OpenFinWindow;
    public wrappedWindow: _Window;
    public isRegistered: boolean;
    private boundLocalWindows: Map<string, Identity>;

    constructor(hostRuntime: PeerRuntime, wrappedWindow: _Window, nativeId: string, windowOptions: any) {
        const { identity: { uuid, name } } = wrappedWindow;
        const windowKey = `${uuid}${name}`;
        const existingProxyWindow = externalWindowsProxyList.get(windowKey);
        //ensure we return an existing object if we have one.
        if (existingProxyWindow) {
            return existingProxyWindow;
        }
        this.hostRuntime = hostRuntime;
        this.wrappedWindow = wrappedWindow;
        this.boundLocalWindows = new Map();

        const proxyWindowOptions = {
            hwnd: '' + nativeId, ...windowOptions
        };
        const browserwindow: any = new BrowserWindowElectron(proxyWindowOptions);

        browserwindow._options = proxyWindowOptions;
        this.window = {
            _options : proxyWindowOptions,
            _window : <BrowserWindow>browserwindow,
            app_uuid: uuid,
            browserWindow: <BrowserWindow>browserwindow,
            children: new Array<OpenFinWindow>(),
            frames: new Map<string, ChildFrameInfo>(),
            forceClose: false,
            groupUuid: '',
            hideReason: '',
            id: 0,
            name,
            preloadScripts: new Array<PreloadScriptState>(),
            uuid,
            mainFrameRoutingId: 0,
            isProxy: true
        };
        externalWindowsProxyList.set(windowKey, this);
    }

    public registerSingle = async (sourceIdentity: Identity): Promise<RuntimeProxyWindow> => {
        if (this.boundLocalWindows.has(getWindowKey(sourceIdentity))) {
            return this;
        }
        this.boundLocalWindows.set(getWindowKey(sourceIdentity), sourceIdentity);
        await this.remoteMerge(sourceIdentity);

        return this;
    }

    public register = async (sourceIdentity: Identity): Promise<Array<RuntimeProxyWindow>> => {

        this.registerSingle(sourceIdentity);

        const remoteWindowGroup = await this.getRemoteWindowGroup();
        await Promise.all(remoteWindowGroup.map(async w => {
            if (!w.isRegistered) {
                await w.registerSingle(sourceIdentity);
            }
        }));
        return remoteWindowGroup;
    }

    //https://english.stackexchange.com/questions/25931/unregister-vs-deregister
    public deregister = async (boundIdentity: Identity): Promise<void> => {
        this.boundLocalWindows.delete(getWindowKey(boundIdentity));
    }

    public destroy = async (): Promise<void> => {
        const { identity: { uuid, name } } = this.wrappedWindow;
        const windowKey = `${uuid}${name}`;


        try {
            this.window.browserWindow.setExternalWindowNativeId('0x0');
            this.window.browserWindow.close();
            await this.wrappedWindow.removeListener('group-changed', this.onGroupChanged);
            await this.wrappedWindow.removeListener('options-changed', this.onOptionsChanged);
        } catch (err) {
            writeToLog('info', 'Non Fatal error: remove all listeners failed for proxy window');
            writeToLog('info', err);
        } finally {
            this.boundLocalWindows.clear();
            externalWindowsProxyList.delete(windowKey);
        }
    }

    private remoteMerge = async (boundIdentity: Identity): Promise<void> => {
        const source = this.hostRuntime.fin.Window.wrapSync(boundIdentity);
        await this.wrappedWindow.mergeGroups(source);
    }

    public wireUpEvents = async (): Promise<void> => {
        await this.wrappedWindow.on('group-changed', this.onGroupChanged);
        await this.wrappedWindow.on('options-changed', this.onOptionsChanged);
        await this.hostRuntime.fin.once('disconnected', () => {
            this.raiseChangeEvents(this.wrappedWindow.identity, 'remove', []);
        });
    };

    private getRemoteWindowGroup = async(): Promise<Array<RuntimeProxyWindow>> => {
        const { identity: { uuid, name } } = this.wrappedWindow;
        const winGroup = await this.wrappedWindow.getGroup();
        const existingWindowGroup: Array<RuntimeProxyWindow> = [];

        await Promise.all(winGroup.map(async (w) => {
            //check if we are dealing with a local window.
            if (coreState.getWindowByUuidName(w.identity.uuid, w.identity.name)) {
                return;
            }
            //confirm we do not return the same runtimeProxyWindow.
            if (w.identity.uuid !== uuid || w.identity.name !== name) {
                const pWin = await getRuntimeProxyWindow(w.identity);
                existingWindowGroup.push(pWin);
            }
        }));

        return existingWindowGroup;
    }

    private raiseChangeEvents = async(targetIdentity: Identity,
        action: 'add' | 'remove', sourceGroup: Array<any>) => {
            this.boundLocalWindows.forEach(sourceIdentity => {

                const groupStateChange: GroupProxyChange = {
                    action,
                    targetIdentity,
                    window: this.window,
                    sourceIdentity,
                    sourceGroup
                };
                groupProxyEvents.emit('process-change', groupStateChange);
            });
    }

    private onGroupChanged = (evt: WindowGroupChanged<'window', 'group-changed'>) => {
        writeToLog('info', 'Group changed event');
        writeToLog('info', evt);
        if (this.window.uuid === evt.targetWindowAppUuid && this.window.name === evt.targetWindowName) {
            if (evt.reason === 'leave') {
                this.raiseChangeEvents({
                    uuid: evt.targetWindowAppUuid,
                    name: evt.targetWindowName
                }, 'remove', []);
            }
            if (evt.reason === 'join' || evt.reason === 'merge') {
                this.raiseChangeEvents({
                    uuid: evt.sourceWindowAppUuid,
                    name: evt.sourceWindowName
                }, 'add', evt.sourceGroup);
            }
        } else if (this.window.uuid === evt.sourceWindowAppUuid && this.window.name === evt.sourceWindowName) {
            if (evt.reason === 'merge') {
                this.raiseChangeEvents({
                    uuid: evt.targetWindowAppUuid,
                    name: evt.targetWindowName
                }, 'add', []);
            }
        }
    };

    private onOptionsChanged = (evt: WindowOptionsChangedEvent<'window', 'options-changed'>) => {
        if (this.window.uuid === evt.uuid && this.window.name === evt.name) {
            const optionsToUpdate: {[name: string]: any} = {};

            Object.keys(evt.diff).forEach((option: keyof WindowOption) => {
                optionsToUpdate[option] = evt.diff[option].newVal;
            });


            this.window._options = Object.assign({}, this.window._options, optionsToUpdate);
            writeToLog('info', 'Options changed event');
            writeToLog('info', evt);
        }
    };
}

export async function getRuntimeProxyWindow(identity: Identity): Promise<RuntimeProxyWindow> {
    const { uuid, name } = identity;
    const windowKey = `${uuid}${name}`;
    const existingProxyWindow = externalWindowsProxyList.get(windowKey);

    if (existingProxyWindow) {
        return existingProxyWindow;
    } else {
        const { runtime: hostRuntime} = await connectionManager.resolveIdentity(identity);
        const apiVersion = hostRuntime.portInfo.version.split('.')[2];

        if (+apiVersion < MIN_API_VER) {
            throw new Error(`Window belongs to an older version, cannot group with Windows on version ${ hostRuntime.portInfo.version }`);
        }
        if (argo['use-legacy-window-groups']) {
            // tslint:disable-next-line:max-line-length
            throw new Error('Unsupported action: Window belongs to another instance of OpenFin and "use-legacy-window-groups" flag suplied.');
        }
        if (hostRuntime.portInfo.options['use-legacy-window-groups']) {
            throw new Error('Unsupported action: Window belongs to another instance of OpenFin that is using "use-legacy-window-groups".');
        }
        const wrappedWindow = hostRuntime.fin.Window.wrapSync(identity);
        const nativeId = await wrappedWindow.getNativeId();
        const windowOptions = await wrappedWindow.getOptions();
        const win = new RuntimeProxyWindow(hostRuntime, wrappedWindow, nativeId, windowOptions);
        win.wireUpEvents();

        return win;
    }
}

export function deregisterAllRuntimeProxyWindows(): void {
    externalWindowsProxyList.forEach(runtimeProxyWindow => {
        runtimeProxyWindow.destroy();
    });
}
