/**
 * All declared modules in this file don't correctly represent all of
 * their functionality, rather things are constantly added here while
 * transitioning the code base to TypeScript to quickly make the editor "happy"
 */
/// <reference path="electron.d.ts"/>

declare namespace Electron {
    class App {
        generateGUID(): string;
        getCommandLineArguments(): string;
        getCommandLineArgv(): string[];
        getNativeWindowInfoForNativeId(nativeId: string): NativeWindowInfo;
        getPath(str: string): string;
        getProcessIdForNativeId(nativeId: string): number;
        getTickCount(): number;
        isAeroGlassEnabled(): boolean;
        log(level: string, message: any): any;
        matchesURL(url: string, patterns: [string]): boolean;
        now(): number;
        nowFromSystemTime(): number;
        on(event: string, callback: () => void): void;
        readRegistryValue(root: string, key: string, value: string): any;
        setMinLogLevel(level: number): void;
        vlog(level: number, message: any, thirdArg?: any): any;
    }

    namespace windowTransaction {
        export class Transaction {
            on(arg0: string, arg1: (event: any, payload: any) => void): any;
            setWindowPos(hwnd: number, pos: { x: any; y: any; w: any; h: any; flags: number; }): any;
            private count: number
            constructor(count: number);
            commit(): any;
        }
        export namespace flag {
            export const noMove: 2;
            export const noSize: 1;
            export const noZorder: 4;
            export const noActivate: 16;
            export const show: 64;
            export const hide: 128;
        }
        export namespace zOrder {
            const hwndBottom: 1;
            const hwndTop: 0;
            const hwndTopMost: -1;
            const hwndNoTopMost: -2;
        }
    }

    export class MessageWindow {
        constructor(classname: string, windowname: string);
        isDestroyed(): boolean;
        on(event: string, callback: (...args: any[]) => any): void;
        sendbyname(classname: string, windowname: string, message: string, maskPayload?: boolean): boolean;
        sendbyid(id: number, message: string, maskPayload?: boolean): boolean;
        setmessagetimeout(timeout: number): void;
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
        bounds: Rectangle;
        size: Size;
        workArea: Rectangle;
        workAreaSize: Size;
    }

    export interface Size {
        width: number;
        height: number;
    }

    interface WebContents {
        fromProcessAndFrameIds: (processId: number, frameId: number) => WebContents;
        getOwnerBrowserWindow: () => BrowserWindow | void;
        mainFrameRoutingId: number;
        session: Session;
    }

    export interface BrowserWindowConstructorOptions {
        hwnd?: string;
    }

    export interface BrowserWindow {
        id: number;
        nativeId: string;

        activate(): void;
        bringToFront(): any;
        forceExternalWindowClose(): void;
        isUserMovementEnabled(): boolean;
        on(eventName: string, listener: (a: any, wnd: any, msg: any) => any): any;
        once(eventName: string, listener: (a: any, wnd: any, msg: any) => any): any;
        removeAllListeners(eventName?: string): any;
        removeListener(eventName: string, listener: (a: any, wnd: any, msg: any) => any): any;
        setUserMovementEnabled(enabled: boolean): void;
        setWindowPlacement(bounds: Rectangle): void;
        subscribeSessionNotifications(b: boolean): void;

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

    export class ExternalWindow extends BrowserWindow { }

    export interface screen {
        getDisplayMatching(rect: Rectangle): Display;
    }

    export interface cookies {
        get: (filter: object, callback: (error: Error, cookies: any[]) => any) => void;
    }

    export interface systemPreferences {
        subscribeNotification(event: string, callback: (event: string, userInfo: any) => void): void;
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
    export namespace fileLock {
        const tryLock: (key: string) => number;
        const releaseLock: (key: string) => number;
    }

}
