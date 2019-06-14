import { BrowserView, BrowserViewConstructorOptions, Rectangle, AutoResizeOptions } from 'electron';
import { Identity } from '../api_protocol/transport_strategy/api_transport_base';
import { addBrowserView, getBrowserViewByIdentity, getWindowByUuidName, OfView } from '../core_state';
import { getRuntimeProxyWindow } from '../window_groups_runtime_proxy';
import { BrowserViewOptions, BrowserViewCreationOptions } from '../../../js-adapter/src/api/browserview/browserview';
import convertOptions = require('../convert_options');
import of_events from '../of_events';
import route from '../../common/route';


// import { BrowserWindow, BrowserView, app } from 'electron';
// import { OpenFinWindow } from '../../shapes';
// const convertToElectron = require('../convert_options').convertToElectron;
// import * as coreState from '../core_state';


// export function addBrowserViewToWindow(options: any, win: BrowserWindow) {
//     const view = new BrowserView(convertToElectron({}, false));
//     const ofWin = coreState.getWinObjById(win.id);
//     if (!ofWin) {
//         return;
//     }
//     const name = app.generateGUID();
//     const uuid = ofWin.uuid;
//     ofWin.views.set(name, { info: { name, uuid, parent: { uuid, name: ofWin.name }, entityType: 'view' }, view });
//     //@ts-ignore
//     view.webContents.registerIframe = win.webContents.registerIframe.bind(view.webContents);
//     view.webContents.loadURL(options.url);
//     view.setBounds(options.bounds);
//     view.setAutoResize(Object.assign({ width: true, height: true }, options.autoResize));
//     win.setBrowserView(view);
// }
export interface BrowserViewOpts extends BrowserViewCreationOptions {
    uuid: string;
}

export async function create(options: BrowserViewOpts) {
    const targetWin = getWindowByUuidName(options.target.uuid, options.target.name);
    if (!targetWin) {
        throw new Error('Target Window could not be found');
    }
    const targetOptions = targetWin._options;
    const fullOptions = Object.assign({}, targetOptions, options);
    const view = new BrowserView(convertOptions.convertToElectron(fullOptions, false));
    const ofView = addBrowserView(fullOptions, view);
    view.webContents.loadURL(options.url);
    if (options.autoResize) {
        view.setAutoResize(options.autoResize);
    } if (options.target) {
        await attach(ofView, options.target);
    } if (options.bounds) {
        setBounds(ofView, options.bounds);
    }
}

export async function attach(ofView: OfView, toIdentity: Identity) {
    const {view} = ofView;
    if (view) {
        const ofWin = getWindowByUuidName(toIdentity.uuid, toIdentity.name);
        let bWin;
        if (!ofWin) {
            throw new Error(`Could not locate target window ${toIdentity.uuid}/${toIdentity.name}`)
        } else {
            bWin = ofWin.browserWindow;
            if (ofWin.view) {
                ofWin.view.view.destroy();
            } 
        }
        ofWin.view = ofView;
        bWin.setBrowserView(view);
        of_events.once(route.window('closed', toIdentity.uuid, toIdentity.name), () => {
            view.destroy();
            ofWin.view = undefined;
        })
    }
}

export async function setAutoResize(ofView: OfView, autoResize: AutoResizeOptions) {
    const { view } = ofView;
    view.setAutoResize(autoResize);
}

export async function setBounds(ofView: OfView, bounds: Rectangle) {
    const {view} = ofView;
    view.setBounds(bounds);
}