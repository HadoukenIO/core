import { BrowserView, BrowserViewConstructorOptions } from "electron";
import { Identity } from "../api_protocol/transport_strategy/api_transport_base";
import { addBrowserView, browserViewByIdentity, getWindowByUuidName } from "../core_state";
import { getRuntimeProxyWindow } from "../window_groups_runtime_proxy";

export interface BrowserViewOptions extends Identity {
    opts: BrowserViewConstructorOptions;
    url: string;
}

export function create(options: BrowserViewOptions) {
    const view = new BrowserView(options.opts);
    addBrowserView(options, view);
    view.webContents.loadURL(options.url);
}

export async function attach(identity: Identity, toIdentity: Identity) {
   const {view} = browserViewByIdentity(identity);
   if (view) {
       const ofWin = getWindowByUuidName(toIdentity.uuid, toIdentity.name);
       let bWin;
       if (!ofWin) {
           const proxyWin = await getRuntimeProxyWindow(toIdentity);
           bWin = proxyWin.window.browserWindow;
       } else {
           bWin = ofWin.browserWindow;
       }
       bWin.setBrowserView(view);
   }
}