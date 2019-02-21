/**
 * All declared modules in this file don't correctly represent all of
 * their functionality, rather things are constantly added here while
 * transitioning the code base to TypeScript to quickly make the editor "happy"
 */

declare module 'electron' {
    import { EventEmitter } from 'events';

    namespace app {
        export function generateGUID(): string;
        export function getAllNativeWindowInfo(skipOwnWindows: boolean): any;
        export function getCommandLineArguments(): string;
        export function getCommandLineArgv(): string[];
        export function getNativeWindowInfoForNativeId(nativeId: string): import('./shapes').RawNativeWindowInfo;
        export function getPath(str: string): string;
        export function getProcessIdForNativeId(nativeId: string): number;
        export function getTickCount(): number;
        export function isAeroGlassEnabled(): boolean;
        export function log(level: string, message: any): any;
        export function matchesURL(url: string, patterns: [string]): boolean;
        export function now(): number;
        export function nowFromSystemTime(): number;
        export function on(event: string, callback: () => void): void;
        export function readRegistryValue(root: string, key: string, value: string): any;
        export function setMinLogLevel(level: number): void;
        export function vlog(level: number, message: any): any;
    }
    namespace windowTransaction {
        export class Transaction {
            on(arg0: string, arg1: (event: any, payload: any) => void): any;
            setWindowPos(hwnd: number, pos: { x: any; y: any; w: any; h: any; flags: number; }): any;
            private count: number
            constructor(count: number);
            commit(): any;
        }
        export interface flag {
            noMove: 2;
            noSize: 1;
            noZorder: 4;
            noActivate: 16;
            show: 64;
            hide: 128;
        }
        export interface zOrder {
            hwndBottom: 1;
            hwndTop: 0;
            hwndTopMost: -1;
            hwndNoTopMost: -2;
        }
    }

    export class MessageWindow {
        constructor(classname: string, windowname: string);
        isDestroyed(): boolean;
        on(event: string, callback: (...args: any[]) => any): void;
        sendbyname(classname: string, windowname: string, message: string, maskPayload?: boolean): boolean;
        setmessagetimeout(timeout: number): void;
    }

    export namespace net {
        export function request(url: string | Object): any;
    }
    export namespace socketNet {
        export function socketRequest(url: string): any;
    }

    export interface Rectangle {
        x: number;
        y: number;
        width: number;
        height: number;
    }

    export interface Display {
        id: number;
        rotation: number;
        scaleFactor: number;
        touchSupport: string;
        bounds: Rectangle;
        size: Size;
        workArea: Rectangle;
        workAreaSize: Size;
    }

    export interface Size {
        width: number;
        height: number;
    }

    export class BrowserWindow {
        constructor(props: any);
        public id: number;
        public nativeId: string;
        static fromId(id: number): BrowserWindow;
        static getAllWindows(): BrowserWindow[];
        static fromWebContents(wc: webContents): BrowserWindow;

        activate(): void;
        bringToFront(): any;
        close(): void;
        devToolsWebContents: null;
        emit(routeString: string, ...args: any[]): void;
        flashFrame(flag: boolean): void;
        focus(): void;
        getBounds(): Rectangle;
        getWindowsByClassName(className: string): any;
        hide(): void;
        hookWindowMessage(n: number, listener: (message: any) => void): void;
        isDestroyed(): boolean;
        isFullScreen(): boolean;
        isMaximized(): boolean;
        isMinimized(): boolean;
        isVisible(): boolean;
        maximize(): void;
        minimize(): void;
        on(eventName: string, listener: (a: any, wnd: any, msg: any) => any): any;
        once(eventName: string, listener: (a: any, wnd: any, msg: any) => any): any;
        removeListener(eventName: string, listener: (a: any, wnd: any, msg: any) => any): any;
        restore(): void;
        sendMessageToWindowByHwnd(hWnd: string, timeout: number, data: string): any;
        setBounds(bounds: Rectangle): void;
        setExternalWindowNativeId(hwnd: string): void;
        setFullScreen(fullscreen: boolean): void;
        setUserMovementEnabled(enabled: boolean): void;
        setWindowPlacement(bounds: Rectangle): void;
        showInactive(): void;
        subscribeSessionNotifications(b: boolean): void;
        unmaximize(): any;
        webContents: webContents;

        _eventsCount: number;
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
    }

    export class webContents {
        hasFrame: (frameName: string) => boolean;
        mainFrameRoutingId: number;
        session: session;
    }

    export namespace screen {
        export function getDisplayMatching(rect: Rectangle): Display;
    }

    export class session {
        cookies: cookies;
    }

    export class cookies {
        get: (filter: Object, callback: (error: Error, cookies: any[]) => any) => void;
    }

    export class ipcMain {

    }

    namespace systemPreferences {
        export function subscribeNotification(event: string, callback: (event: string, userInfo: any) => void): void;
    }

    export class chromeIpcClient {
        connect(pipeName: string): void;
        on(event: string, callback: () => any): void;
        send(data: any): void;
        close(): void;
    }

    export class idleState {
        public isIdle(): boolean;
        public elapsedTime(): number;
        public isScreenSaverRunning(): boolean;
    }

    export class nativeTimer {
        constructor(action: () => void, intervalTime: number);
        public stop(): void;
        public reset(): void;
        public isRunning(): boolean;
    }

    namespace clipboard {
        export function write(data: { text?: string; html?: string; rtf?: string; }, type?: string): void;
        export function writeRTF(data: string, type?: string): void;
        export function writeHTML(data: string, type?: string): void;
        export function writeText(data: string, type?: string): void;
        export function availableFormats(type?: string): string[];
        export function clear(type?: string): void;
        export function readRTF(type?: string): string;
        export function readHTML(type?: string): string;
        export function readText(type?: string): string;
    }

    export class winEventHookEmitter extends EventEmitter {
        constructor(opts: { pid?: number });
    }
}
