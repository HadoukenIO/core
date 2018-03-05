/*
Copyright 2017 OpenFin Inc.

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

export interface Identity {
    uuid: string;
    name?: string;
    runtimeUuid?: string;
}

export interface ServiceIdentity {
    uuid: string;
    name?: string;
    serviceName: string;
}

export interface ResourceFetchIdentity extends Identity {
    resourceFetch?: boolean;
}

export type EntityType = 'window' | 'iframe' | 'external connection' | 'unknown';
export type AuthCallback = (username: string, password: string) => void;

export interface FrameInfo extends Identity {
    name?: string;
    parent: Identity;
    entityType: EntityType;
}

export interface ChildFrameInfo extends FrameInfo {
    frameRoutingId: number;
}

export interface APIMessage {
    action: string;
    messageId: number;
    payload: any;
}

// ToDo following duplicated in ack.ts

export interface APIPayloadAck {
    success: boolean;
    data?: any;
}
export type Acker = (payload: APIPayloadAck) => void;

export interface APIPayloadNack {
    success: boolean;
    error?: Error;
    reason?: string;
}
export type Nacker = (payload: APIPayloadNack) => void;

export interface ProxySettings {
    proxyAddress: string;
    proxyPort: number;
    type: string;
}

export interface App {
    _configUrl?: string;
    _options?: WindowOptions;
    appObj: AppObj|null;
    children?: Window[];
    id: number;
    isRestarting?: boolean;
    isRunning: boolean;
    licenseKey?: string;
    parentUuid?: string;
    sentHideSplashScreen: boolean;
    uuid: string;
}

export interface Window {
    children: number[];
    id: number;
    openfinWindow: OpenFinWindow|null;
    parentId?: number;
}

export interface OpenFinWindow {
    isIframe?: boolean;
    parentFrameId?: number;
    _openListeners: (() => void)[];
    _options: WindowOptions;
    _window: BrowserWindow;
    app_uuid: string;
    browserWindow: BrowserWindow;
    children: OpenFinWindow[];
    frames: Map<string, ChildFrameInfo>;
    forceClose: boolean;
    groupUuid: string|null;
    hideReason: string;
    id: number;
    name: string;
    plugins: PluginState[];
    preloadScripts: PreloadScriptState[];
    uuid: string;
    mainFrameRoutingId: number;
}

export interface BrowserWindow {
    _events: {
        blur: (() => void)[];
        close: (() => void)[];
        closed: (() => void)[];
        focus: (() => void)[];
        maximize: (() => void)[];
        minimize: (() => void)[];
        restore: (() => void)[];
        unmaximize: (() => void)[];
        'visibility-changed': (() => void)[];
    };
    _eventsCount: number;
    _options: WindowOptions;
    devToolsWebContents: null;
    webContents: {
        hasFrame: (frameName: string) => boolean;
        mainFrameRoutingId: number;
    };
    isDestroyed(): boolean;
}

export interface AppObj {
    _configUrl: string;
    _options: WindowOptions;
    _processInfo: any;
    id: number;
    identity: Identity;
    launchMode: string;
    mainWindow: BrowserWindow;
    parentUuid: string;
    toShowOnRun: boolean;
    tray: null|any;
    uuid: string;
}

export type WebRequestHeader = {[key: string]: string};

export type WebRequestHeaderConfig = {
    urlPatterns: string[],
    headers: WebRequestHeader[]  // key=value is added to headers
};

export interface WindowOptions {
    accelerator?: {
        devtools: boolean;
        reload: boolean;
        reloadIgnoringCache: boolean;
        zoom: boolean;
    };
    alphaMask?: {
        blue: number;
        green: number;
        red: number;
    };
    alwaysOnBottom?: boolean;
    alwaysOnTop?: boolean;
    applicationIcon?: string;
    autoShow?: boolean;
    backgroundColor?: string;
    backgroundThrottling?: boolean;
    center?: boolean;
    contentNavigation?: null|{
        whitelist?: string[];
        blacklist?: string[];
    };
    contextMenu?: boolean;
    cornerRounding?: {
        height: number;
        width: number;
    };
    customData?: string;
    customRequestHeaders?: WebRequestHeaderConfig[];
    defaultCentered?: boolean;
    defaultHeight?: number;
    defaultLeft?: number;
    defaultTop?: number;
    defaultWidth?: number;
    delay_connection?: boolean;
    description?: string;
    disableIabSecureLogging?: boolean;
    draggable?: boolean;
    enableAppLogging?: boolean;
    'enable-plugins'?: boolean;
    enableLargerThanScreen?: boolean;
    exitOnClose?: boolean;
    frame?: boolean;
    frameConnect?: 'all'|'last'|'main-window';
    hasLoaded?: boolean;
    height?: number;
    hideOnBlur?: boolean;
    hideOnClose?: boolean;
    hideWhileChildrenVisible?: boolean;
    icon?: string;
    launchExternal?: string;
    loadErrorMessage?: string;
    maxHeight?: number;
    maximizable?: boolean;
    maxWidth?: number;
    minHeight?: number;
    minimizable?: boolean;
    minWidth?: number;
    name: string;
    nonPersistent?: boolean;
    nonPersistant?: boolean;  // deprecated, backwards compatible
    opacity?: number;
    plugins?: boolean;
    preload?: string|PreloadScript[]; // deprecated, use 'preloadScripts'
    preloadScripts?: PreloadScript[];
    resizable?: boolean;
    resize?: boolean;
    resizeRegion?: {
        bottomRightCorner: number;
        size: number;
        sides?: {
            top?: boolean,
            right?: boolean,
            bottom?: boolean,
            left?: boolean
        };
    };
    saveWindowState?: boolean;
    shadow?: boolean;
    show?: boolean;
    showTaskbarIcon?: boolean;
    skipTaskbar?: boolean;
    smallWindow?: boolean;
    state?: 'maximized'|'minimized'|'normal';
    taskbarIcon?: string;
    taskbarIconGroup?: string;
    title?: string;
    toShowOnRun?: boolean;
    transparent?: boolean;
    url: string;
    uuid: string;
    waitForPageLoad?: boolean;
    webPreferences?: {
        nodeIntegration: boolean;
        plugins: boolean;
    };
    width?: number;
    x?: number;
    y?: number;
}

export const DEFAULT_RESIZE_REGION_SIZE = 7;
export const DEFAULT_RESIZE_REGION_BOTTOM_RIGHT_CORNER = 9;
export const DEFAULT_RESIZE_SIDES = {top: true, right: true, bottom: true, left: true};

export interface Manifest {
    appAssets?: {
        alias: string;
        args?: string;
        src: string;
        target?: string;
        version: string;
    }[];
    assetsUrl?: string;
    devtools_port?: number;
    dialogSettings?: {
        bgColor?: number;
        logo?: string;
        progressBarBgColor?: number;
        progressBarBorderColor?: number;
        progressBarFillColor?: number;
        textColor?: number;
    };
    licenseKey: string;
    offlineAccess?: boolean;
    plugins?: Plugin[];
    proxy?: ProxySettings;
    runtime: {
        arguments?: string;
        fallbackVersion?: string;
        forceLatest?: boolean;
        futureVersion?: string;
        version: string;
    };
    shortcut?: {
        company: string;
        description?: string;
        force?: boolean;
        icon: string,
        name: string;
        startMenuRootFolder?: string;
        target?: ('desktop'|'start-menu'|'automatic-start-up')[];
        'uninstall-shortcut'?: boolean;
    };
    splashScreenImage?: string;
    startup_app: WindowOptions;
    supportInformation?: {
        company: string;
        email: string;
        product: string;
        forwardErrorReports?: boolean;
        enableErrorReporting?: boolean;
    };
}

export interface Plugin {
    link?: string;
    mandatory?: boolean;
    name: string;
    version: string;
}

export interface PluginState extends Plugin {
    state: 'load-failed'|'load-succeeded'|'failed'|'succeeded';
}

export interface PreloadScript {
    mandatory?: boolean;
    url: string;
}

export interface PreloadScriptState extends PreloadScript {
    state: 'load-started'|'load-failed'|'load-succeeded'|'failed'|'succeeded';
}

export interface EventPayload {
    type: string;
    topic: string;
    uuid: string;
    name?: string;
}
