//This module is responsible for :
// a) Producing and maintaining proxy Browser windows owned by another runtime.
// b) Keeping window group state cross runtimes

import { BrowserWindow as BrowserWindowElectron } from 'electron';
import { OpenFinWindow, Identity, BrowserWindow, ChildFrameInfo, PreloadScriptState } from '../shapes';
import { default as connectionManager, PeerRuntime } from './connection_manager';
import * as coreState from './core_state';
import { _Window } from 'hadouken-js-adapter/out/types/src/api/window/window';
import { EventEmitter } from 'events';

class MyEmitter extends EventEmitter {}

const externalWindowsProxyList = new Map<string, RuntimeProxyWindow>();

//TODO: better name.
export const eventsPipe = new MyEmitter();

export interface RuntimeProxyWindow {
    hostRuntime: PeerRuntime;
    window: OpenFinWindow;
    wrappedWindow: _Window;
    isRegistered: boolean;
}

export interface RemoteWindowInformation {
    proxyWindow: RuntimeProxyWindow;
    existingWindowGroup: Array<RuntimeProxyWindow>;
}

//TODO: should return bool as well if this needs registration
export async function getRuntimeProxyWindow(identity: Identity): Promise<RuntimeProxyWindow> {
    const { uuid, name } = identity;
    const windowKey = `${uuid}${name}`;
    const existingProxyWindow = externalWindowsProxyList.get(windowKey);

    if (existingProxyWindow) {
        return existingProxyWindow;
    } else {
        const { runtime: hostRuntime} = await connectionManager.resolveIdentity(identity);
        const wrappedWindow = hostRuntime.fin.Window.wrapSync(identity);
        const nativeId = await wrappedWindow.getNativeId();
        const proxyWindowOptions = {
            hwnd: '' + nativeId,
            uuid,
            name,
            url: ''
        };
        const browserwindow: any = new BrowserWindowElectron(proxyWindowOptions);

        browserwindow._options = proxyWindowOptions;
        const window: OpenFinWindow = {
            _options : proxyWindowOptions,
            _window : <BrowserWindow>browserwindow,
            app_uuid: wrappedWindow.identity.uuid,
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

        const runtimeProxyWindow = {
            window,
            hostRuntime,
            wrappedWindow,
            isRegistered: false
        };
        externalWindowsProxyList.set(windowKey, runtimeProxyWindow);
        return runtimeProxyWindow;
    }
}

export async function getRemoteWindowInformation(windowIdentity: Identity): Promise<RemoteWindowInformation> {
    const remoteWindow = await getRuntimeProxyWindow(windowIdentity);
    const existingWindowGroup: Array<RuntimeProxyWindow> = [];
    const winGroup = await remoteWindow.wrappedWindow.getGroup();

    await Promise.all(winGroup.map(async (w) => {
        if (coreState.getWindowByUuidName(w.identity.uuid, w.identity.name)) {
            return;
        }
        if (w.identity.uuid !== windowIdentity.uuid || w.identity.name !== windowIdentity.name) {
            const pWin = await getRuntimeProxyWindow(w.identity);
            existingWindowGroup.push(pWin);
        }
    }));

    return {
        proxyWindow: remoteWindow,
        existingWindowGroup
    };
}

export async function getWindowGroupProxyWindows(runtimeProxyWindow: RuntimeProxyWindow) {
    const { identity } = runtimeProxyWindow.wrappedWindow;
    const winGroup = await runtimeProxyWindow.wrappedWindow.getGroup();
    const existingWindowGroup: Array<RuntimeProxyWindow> = [];

    await Promise.all(winGroup.map(async (w) => {
        //check if we are dealing with a local window.
        if (coreState.getWindowByUuidName(w.identity.uuid, w.identity.name)) {
            return;
        }
        //confirm we do not return the same runtimeProxyWindow.
        if (w.identity.uuid !== identity.uuid || w.identity.name !== identity.name) {
            const pWin = await getRuntimeProxyWindow(w.identity);
            existingWindowGroup.push(pWin);
        }
    }));

    return existingWindowGroup;
}

export async function registerRemoteProxyWindow(sourceIdentity: Identity, win: RuntimeProxyWindow) {
    const source = win.hostRuntime.fin.Window.wrapSync(sourceIdentity);
    await win.wrappedWindow.mergeGroups(source);
    await win.wrappedWindow.on('group-changed', () => {
        //raise some normalized events, also re-write this to allow cleanup of events.
        //do stuff.
    });
    await win.hostRuntime.fin.once('disconnected', () => {
        //raise some normalized events, also re-write to allow cleanup.
        //do more stuff.
    });
}

export async function getExistingWindowGroup(win: RuntimeProxyWindow) {
    const wg = await win.wrappedWindow.getGroup();
    return wg.map(w => w.identity);
}
