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

/**
 * Window bounds
 */
export interface WindowBounds {
    x: number;
    y: number;
    width: number;
    height: number;
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
    _openListeners: (() => void)[];
    _options: WindowOptions;
    _window: BrowserWindow;
    app_uuid: string;
    browserWindow: BrowserWindow;
    children: OpenFinWindow[];
    forceClose: boolean;
    groupUuid: string|null;
    hideReason: string;
    id: number;
    name: string;
    uuid: string;
    preloadState: {
        optional?: boolean;
        state: 'load-started'|'load-failed'|'load-succeeded'|'failed'|'succeeded';
        url: string;
    }[];
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
        whitelist: string[];
    };
    contextMenu?: boolean;
    cornerRounding?: {
        height: number;
        width: number;
    };
    customData?: string;
    defaultCentered?: boolean;
    defaultHeight?: number;
    defaultLeft?: number;
    defaultTop?: number;
    defaultWidth?: number;
    delay_connection?: boolean;
    description?: string;
    draggable?: boolean;
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
    opacity?: number;
    plugins?: boolean;
    preload?: string;
    resizable?: boolean;
    resize?: boolean;
    resizeRegion?: {
        bottomRightCorner: number;
        size: number;
    };
    saveWindowState?: boolean;
    shadow?: boolean;
    show?: boolean;
    showTaskbarIcon?: boolean;
    skipTaskbar?: boolean;
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
