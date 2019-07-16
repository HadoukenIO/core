import { BrowserView, BrowserViewConstructorOptions, Rectangle, AutoResizeOptions, webContents, BrowserWindow } from 'electron';
import { Identity } from '../api_protocol/transport_strategy/api_transport_base';
import { addBrowserView, getBrowserViewByIdentity, getWindowByUuidName, OfView, removeBrowserView, updateViewTarget } from '../core_state';
import { getRuntimeProxyWindow } from '../window_groups_runtime_proxy';
import { BrowserViewOptions, BrowserViewCreationOptions } from '../../../js-adapter/src/api/browserview/browserview';
import convertOptions = require('../convert_options');
import {getInfo as getWebContentsInfo} from './webcontents';
import of_events from '../of_events';
import route from '../../common/route';
import { browserViewActionMap } from '../api_protocol/api_handlers/browser_view';
import { getElectronBrowserWindow } from '../api_protocol/api_handlers/webcontents';


const windowCloseListenerMap = new WeakMap();

export interface BrowserViewOpts extends BrowserViewCreationOptions {
    uuid: string;
}

export async function create(options: BrowserViewOpts) {
    if (!options.target) {
        throw new Error('Must supply target identity');
    }
    const targetWin = getWindowByUuidName(options.target.uuid, options.target.name);
    if (!targetWin) {
        throw new Error('Target Window could not be found');
    }
    const targetOptions = targetWin._options;
    const fullOptions = Object.assign({}, targetOptions, options);
    const view = new BrowserView(convertOptions.convertToElectron(fullOptions, false));
    const ofView = addBrowserView(fullOptions, view);
    await attach(ofView, options.target);
    view.webContents.loadURL(options.url || 'about:blank');
    if (options.autoResize) {
        view.setAutoResize(options.autoResize);
    } if (options.bounds) {
        setBounds(ofView, options.bounds);
    }
}
export function hide(ofView: OfView) {
    const win = getElectronBrowserWindow(ofView.target);
    win.removeBrowserView(ofView.view);
}
export function show(ofView: OfView) {
    const win = getElectronBrowserWindow(ofView.target);
    win.addBrowserView(ofView.view);
}
export async function attach(ofView: OfView, toIdentity: Identity) {
    const {view} = ofView;
    if (view) {
        const ofWin = getWindowByUuidName(toIdentity.uuid, toIdentity.name);
        if (!ofWin) {
            throw new Error(`Could not locate target window ${toIdentity.uuid}/${toIdentity.name}`);
        }
        const bWin = ofWin.browserWindow;
        ofWin.view = ofView;
        bWin.addBrowserView(view);
        const listener = () => {
            destroy(ofView);
            ofWin.view = undefined;
            windowCloseListenerMap.delete(ofWin);
        };
        of_events.once(route.window('closed', toIdentity.uuid, toIdentity.name), listener);
        windowCloseListenerMap.set(ofWin, listener);
        updateViewTarget(ofView, toIdentity);
    }
}
function destroy (ofView: OfView) {
   removeBrowserView(ofView);
   ofView.view.destroy();
}
export async function setAutoResize(ofView: OfView, autoResize: AutoResizeOptions) {
    const { view } = ofView;
    view.setAutoResize(autoResize);
}

export async function setBounds(ofView: OfView, bounds: Rectangle) {
    const {view} = ofView;
    view.setBounds(bounds);
}

export function getInfo (ofView: OfView) {
    return getWebContentsInfo(ofView.view.webContents);
}