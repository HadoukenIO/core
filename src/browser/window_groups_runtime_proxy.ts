//This module is responsible for :
// a) Producing and maintaining proxy Browser windows owned by another runtime.
// b) Keeping window group state cross runtimes

import { BrowserWindow as BrowserWindowElectron } from 'electron';
import { OpenFinWindow, Identity, BrowserWindow, ChildFrameInfo, PreloadScriptState } from '../shapes';
import { default as connectionManager, PeerRuntime } from './connection_manager';
import * as coreState from './core_state';
import { _Window } from 'hadouken-js-adapter/out/types/src/api/window/window';
import { EventEmitter } from 'events';
import { writeToLog } from './log';

//Only allow window proxies to >=.35 runtimes.
const MIN_API_VER = 37;
class MyEmitter extends EventEmitter {}
const externalWindowsProxyList = new Map<string, RuntimeProxyWindow>();

export const groupProxyEvents = new MyEmitter();

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
    public sourceIdentity: Identity;

    constructor(hostRuntime: PeerRuntime, wrappedWindow: _Window, nativeId: string) {
        this.hostRuntime = hostRuntime;
        this.wrappedWindow = wrappedWindow;
        const { identity: { uuid, name } } = wrappedWindow;

        const proxyWindowOptions = {
            hwnd: '' + nativeId,
            uuid,
            name,
            url: ''
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
        const windowKey = `${uuid}${name}`;
        externalWindowsProxyList.set(windowKey, this);
    }

    public registerSingle = async (sourceIdentity: Identity): Promise<RuntimeProxyWindow> => {
        this.sourceIdentity = sourceIdentity;
        await this.wireUpEvents();
        await this.remoteMerge();

        return this;
    }

    public register = async (sourceIdentity: Identity): Promise<Array<RuntimeProxyWindow>> => {
        this.registerSingle(sourceIdentity);

        const remoteWindowGroup = await this.getRemoteWindowGroup();
        await Promise.all(remoteWindowGroup.map(async w => {
            if (!w.isRegistered) {
                await w.wireUpEvents();
            }
        }));
        return remoteWindowGroup;
    }

    //https://english.stackexchange.com/questions/25931/unregister-vs-deregister
    public deregister = async () => {
        const { identity: { uuid, name } } = this.wrappedWindow;
        const windowKey = `${uuid}${name}`;

        externalWindowsProxyList.delete(windowKey);
        this.window.browserWindow.setExternalWindowNativeId('0x0');
        this.window.browserWindow.close();
        await this.wrappedWindow.removeAllListeners();
    }

    private remoteMerge = async (): Promise<void> => {
        const source = this.hostRuntime.fin.Window.wrapSync(this.sourceIdentity);
        await this.wrappedWindow.mergeGroups(source);
    }

    private wireUpEvents = async (): Promise<void> => {
        await this.wrappedWindow.on('group-changed', (evt) => {
            writeToLog('info', 'Group changed event');
            writeToLog('info', evt);

            if (this.window.uuid === evt.targetWindowAppUuid && this.window.name === evt.targetWindowName) {
                if (evt.reason === 'leave') {
                    this.raiseChangeEvents(this.sourceIdentity, {
                        uuid: evt.targetWindowAppUuid,
                        name: evt.targetWindowName
                    }, 'remove', []);
                }
                if (evt.reason === 'join') {
                    this.raiseChangeEvents(this.sourceIdentity, {
                        uuid: evt.sourceWindowAppUuid,
                        name: evt.sourceWindowName
                    }, 'add', evt.sourceGroup);
                }
            } else if (this.window.uuid === evt.sourceWindowAppUuid && this.window.name === evt.sourceWindowName) {
                if (evt.reason === 'merge') {
                    this.raiseChangeEvents(this.sourceIdentity, {
                        uuid: evt.targetWindowAppUuid,
                        name: evt.targetWindowName
                    }, 'add', []);
                }
            }
        });
        await this.hostRuntime.fin.once('disconnected', () => {
            this.raiseChangeEvents(this.sourceIdentity, this.wrappedWindow.identity, 'remove', []);
        });
        this.isRegistered = true;
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

    private raiseChangeEvents = async(sourceIdentity: Identity, targetIdentity: Identity,
        action: 'add' | 'remove', sourceGroup: Array<any>) => {
        const groupStateChange: GroupProxyChange = {
            action,
            targetIdentity,
            window: this.window,
            sourceIdentity,
            sourceGroup
        };
        groupProxyEvents.emit('process-change', groupStateChange);
    }
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
        const wrappedWindow = hostRuntime.fin.Window.wrapSync(identity);
        const nativeId = await wrappedWindow.getNativeId();
        return new RuntimeProxyWindow(hostRuntime, wrappedWindow, nativeId);
    }
}

export function deregisterAllRuntimeProxyWindows(): void {
    externalWindowsProxyList.forEach(runtimeProxyWindow => {
        runtimeProxyWindow.deregister();
    });
}
