import { BrowserView, Rectangle, AutoResizeOptions } from 'electron';
import { Identity } from '../api_protocol/transport_strategy/api_transport_base';
import {
    addBrowserView, getBrowserViewByIdentity, getWindowByUuidName, OfView, removeBrowserView,
    updateViewTarget, getInfoByUuidFrame
} from '../core_state';
import { BrowserViewCreationOptions } from '../../../js-adapter/src/api/browserview/browserview';
import convertOptions = require('../convert_options');
import { getInfo as getWebContentsInfo, setIframeHandlers, hookWebContentsEvents} from './webcontents';
import of_events from '../of_events';
import route from '../../common/route';
import { getElectronBrowserWindow } from './window';
import { OpenFinWindow, WebOptions } from '../../shapes';
import { downloadScripts } from '../preload_scripts';


const windowCloseListenerMap: WeakMap<OpenFinWindow, WeakMap<OfView, () => void>> = new WeakMap();

export type BrowserViewOpts = WebOptions & BrowserViewCreationOptions;
export async function create(options: BrowserViewOpts) {
    // checking if the name-uuid combination is already in use
    const { uuid, name } = options;
    if (getWindowByUuidName(uuid, name) || getBrowserViewByIdentity({ uuid, name }) || getInfoByUuidFrame({ uuid, name })) {
        throw new Error('Trying to create a BrowserView with name-uuid combination already in use - '
            + JSON.stringify({ name, uuid }));
    }

    if (!options.target) {
        throw new Error('Must supply target identity');
    }
    const targetIdentity = options.target;
    const targetWin = getWindowByUuidName(targetIdentity.uuid, targetIdentity.name);
    if (!targetWin) {
        throw new Error('Target Window could not be found');
    }

    const targetOptions = targetWin._options;
    const fullOptions = Object.assign({}, targetOptions, options);
    const convertedOptions = convertOptions.convertToElectron(fullOptions, false);
    convertedOptions.webPreferences.affinity = uuid;
    const view = new BrowserView(convertedOptions);
    const ofView = addBrowserView(fullOptions, view);

    hookWebContentsEvents(view.webContents, options, 'view', route.view);

    of_events.emit(route.view('created', ofView.uuid, ofView.name), {
        name: ofView.name,
        uuid: ofView.uuid,
        target: ofView.target
    });

    await attach(ofView, options.target);
    setIframeHandlers(view.webContents, ofView, options.uuid, options.name);
    if (options.autoResize) {
        view.setAutoResize(options.autoResize);
    } if (options.bounds) {
        setBounds(ofView, options.bounds);
    }

    of_events.emit(route.view('shown', ofView.uuid, ofView.name), {
        name: ofView.name,
        uuid: ofView.uuid,
        target: ofView.target
    });
    if (fullOptions.preloadScripts && fullOptions.preloadScripts.length) {
        await downloadScripts(ofView, fullOptions.preloadScripts);
    }
    await view.webContents.loadURL(options.url || 'about:blank');
}
export function hide(ofView: OfView) {
    const {name, uuid, target, view} = ofView;
    if (!view.isDestroyed()) {
        const win = getElectronBrowserWindow(target);
        win.removeBrowserView(view);
        of_events.emit(route.view('hidden', uuid, name), {name, uuid, target});
    }
}

export function show(ofView: OfView) {
    const {name, uuid, target, view} = ofView;
    if (!view.isDestroyed()) {
        const win = getElectronBrowserWindow(target);
        win.addBrowserView(view);
        of_events.emit(route.view('shown', uuid, name), {name, uuid, target});
    }
}

export async function attach(ofView: OfView, toIdentity: Identity) {
    const {view, target: previousTarget} = ofView;

    if (view && ! view.isDestroyed()) {
        const ofWin = getWindowByUuidName(toIdentity.uuid, toIdentity.name);
        const oldWin = getWindowByUuidName(previousTarget.uuid, previousTarget.name);

        if (!ofWin) {
            throw new Error(`Could not locate target window ${toIdentity.uuid}/${toIdentity.name}`);
        }
        if (!oldWin) {
            throw new Error(`Could not locate origin window ${previousTarget.uuid}/${previousTarget.name}`);
        }

        const oldwinMap = windowCloseListenerMap.get(oldWin);

        if (previousTarget.name !== toIdentity.name) {
            oldWin.browserWindow.removeBrowserView(view);
            of_events.emit(route.window('view-detached', previousTarget.uuid, previousTarget.name), {
                viewIdentity: {uuid: ofView.uuid, name: ofView.name},
                target: toIdentity,
                previousTarget
            });
            if (oldwinMap) {
                const listener = oldwinMap.get(ofView);
                if (typeof listener === 'function') {
                    of_events.removeListener(route.window('closed', previousTarget.uuid, previousTarget.name), listener);
                }
                oldwinMap.delete(ofView);
            }
        } else if (oldwinMap && oldwinMap.has(ofView)) {
           return;
        }

        const bWin = ofWin.browserWindow;
        bWin.addBrowserView(view);

        const listener = () => {
            destroy(ofView);
            windowCloseListenerMap.delete(ofWin);
        };
        of_events.once(route.window('closed', toIdentity.uuid, toIdentity.name), listener);

        if (!windowCloseListenerMap.has(ofWin)) {
            windowCloseListenerMap.set(ofWin, new WeakMap());
        }
        windowCloseListenerMap.get(ofWin).set(ofView, listener);

        updateViewTarget(ofView, toIdentity);
        of_events.emit(route.view('attached', ofView.uuid, ofView.name), {
            target: toIdentity,
            previousTarget
        });
        of_events.emit(route.window('view-attached', toIdentity.uuid, toIdentity.name), {
            viewIdentity: {uuid: ofView.uuid, name: ofView.name},
            target: toIdentity,
            previousTarget
        });
    }
}
export async function destroy (ofView: OfView) {
    const {uuid, name, target, view} = ofView;
    removeBrowserView(ofView);
    if (!view.isDestroyed()) {
        view.destroy();
        of_events.emit(route.view('destroyed', uuid, name), {target});
    }
}

export async function setAutoResize(ofView: OfView, autoResize: AutoResizeOptions) {
    const { view } = ofView;
    if (!view.isDestroyed()) {
        view.setAutoResize(autoResize);
    }
}

export async function setBounds(ofView: OfView, bounds: Rectangle) {
    const {view} = ofView;
    if (!view.isDestroyed()) {
        view.setBounds(bounds);
    }
}

export function getInfo (ofView: OfView) {
    return getWebContentsInfo(ofView.view.webContents);
}

export function getCurrentWindow(ofView: OfView) {
    return ofView.target;
}

export function addEventListener({uuid, name}: Identity, type: string, listener: (...args: any) => void) {
    const eventString = route.view(type, uuid, name);
    const errRegex = /^Attempting to call a function in a renderer window that has been closed or released/;
    let unsubscribe;
    let browserWinIsDead;

    const safeListener = (...args: any[]) => {
        try {
            listener.call(null, ...args);
        } catch (err) {
            browserWinIsDead = errRegex.test(err.message);

            if (browserWinIsDead) {
                of_events.removeListener(eventString, safeListener);
            }
        }
    };

    of_events.on(eventString, safeListener);

    unsubscribe = () => {
        of_events.removeListener(eventString, safeListener);
    };
    return unsubscribe;
}