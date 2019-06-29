
import { PortInfo } from './browser/port_discovery';
import {
    BrowserWindow as BrowserWindowElectron,
    NativeWindowInfo as NativeWindowInfoElectron,
    Process as ProcessElectron
} from 'electron';
import { ERROR_BOX_TYPES } from './common/errors';
import { AnchorType } from '../js-adapter/src/shapes';

export interface Identity {
    uuid: string;
    name?: string;
    runtimeUuid?: string;
}

export interface ProviderIdentity extends Identity {
    channelId?: string;
    channelName?: string;
    isExternal?: boolean;
    runtimeUuid?: string;
}

export interface ResourceFetchIdentity extends Identity {
    resourceFetch?: boolean;
}

export type EntityType = 'window' | 'iframe' | 'external connection' | 'unknown';
export type AuthCallback = (username: string, password: string) => void;
export type Listener = (...args: any[]) => void;

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
    locals?: any; // found in processSnapshot() in our System API handler
    options?: any; // found in getAppAssetInfo() in our System API handler
    eventName?: string; // found in raiseEvent() in our System API handler
}

// ToDo following duplicated in ack.ts

export interface APIPayloadAck {
    success: boolean;
    data?: any;
}

export interface APIPayloadNack {
    success: boolean;
    error?: Error;
    reason?: string;
}

export type Acker = (payload: APIPayloadAck) => void;
export type Nacker = (payload: APIPayloadNack) => void;
export type NackerError = (payload: Error) => void;
export type NackerErrorString = (payload: string) => void;

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
    preloadScripts: PreloadScriptState[];
    uuid: string;
    mainFrameRoutingId: number;
    isProxy?: boolean;
}

export interface BrowserWindow extends BrowserWindowElectron {
    _options: WindowOptions;
    setExternalWindowNativeId(hwnd: string): void;
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
    urlPatterns: [string],
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
    api?: any;
    applicationIcon?: string;
    appLogFlushInterval?: number;
    aspectRatio?: number;
    autoShow?: boolean;
    backgroundColor?: string;
    backgroundThrottling?: boolean;
    center?: boolean;
    contentNavigation?: null|{
        whitelist?: string[];
        blacklist?: string[];
    };
    contextMenu?: boolean;
    contextMenuSettings?: {
        enable: boolean,
        devtools?: boolean,
        reload?: boolean
    };
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
    isRawWindowOpen?: boolean;
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
    _type?: ERROR_BOX_TYPES;
    url?: string;
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
    proxy?: ProxySettings;
    runtime: {
        arguments?: string;
        fallbackVersion?: string;
        forceLatest?: boolean;
        futureVersion?: string;
        version: string;
    };
    services?: string[];
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

export interface ElectronIpcChannels {
    CORE_MESSAGE: string;
    WINDOW_MESSAGE: string;
}

export interface WindowInitialOptionSet {
    options: WindowOptions;
    entityInfo: FrameInfo;
    enableChromiumBuild: boolean;
    socketServerState: PortInfo;
    frames: ChildFrameInfo[];
    elIPCConfig: {
        channels: ElectronIpcChannels
    };
}

export interface SavedDiskBounds {
    active: string;
    height: number;
    left: number;
    name: string;
    top: number;
    width: number;
    windowState: string;
    zoomLevel: number;
}

export interface Cookie {
    domain: string;
    expirationDate: number;
    name: string;
    path: string;
}

export interface Entity {
    type: 'application' | 'external-app';
    uuid: string;
}

export interface FileStatInfo {
    name: string;
    size: number;
    date: number;
}

export interface StartManifest {
    data: Manifest;
    url: string;
}

export type APIHandlerFunc = (identity: Identity, message: APIMessage, ack: Acker, nack?: Nacker|NackerError|NackerErrorString) => void;

export interface APIHandlerMap {
    [route: string]: APIHandlerFunc | {
        apiFunc: APIHandlerFunc;
        apiPath?: string;
        apiPolicyDelegate?: {
            checkPermissions: (args: any) => boolean;
        }
    };
}

export interface Subscriber {
    directMsg: string;
    name: string;
    senderName: string;
    senderUuid: string;
    topic: string;
    uuid: string;
}

export type Func = () => void;

export interface MoveWindowByOpts {
    deltaLeft: number;
    deltaTop: number;
}

export interface MoveWindowToOpts {
    left: number;
    top: number;
}

export interface ResizeWindowByOpts {
    anchor: AnchorType;
    deltaHeight: number;
    deltaWidth: number;
}

export interface ResizeWindowToOpts {
    anchor: AnchorType;
    height: number;
    width: number;
}

export interface ShowWindowAtOpts extends MoveWindowToOpts {
    force?: boolean;
}

export interface Bounds {
    height: number;
    width: number;
    x: number;
    y: number;
}

export interface CoordinatesXY {
    x: number;
    y: number;
}

// This mock is for window grouping accepting external windows
interface BrowserWindowMock extends BrowserWindowElectron {
    _options: WindowOptions;
}

export interface ExternalWindow extends BrowserWindowElectron {
    _options: WindowOptions;
    _userMovement?: boolean;
    _window?: {};
    app_uuid?: string;
    browserWindow: BrowserWindowMock;
    groupUuid?: string;
    isExternalWindow: boolean;
    isProxy?: boolean;
    name: string;
    uuid: string;
}

export interface Process extends Omit<ProcessElectron, 'imageName'> {
    injected: boolean;
    pid: number;
}

export interface NativeWindowInfo extends Omit<NativeWindowInfoElectron, 'process'> {
    process: Process;
    name: string;
    uuid: string;
}

export type NativeWindowInfoLite = Pick<NativeWindowInfo, 'name'|'process'|'title'|'uuid'|'visible'>;

export type GroupWindow = (ExternalWindow | OpenFinWindow) & {
    isExternalWindow?: boolean;
};

export interface GroupWindowIdentity extends Identity {
    isExternalWindow?: boolean;
}
