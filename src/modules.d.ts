/**
 * All declared modules in this file don't correctly represent all of
 * their functionality, rather things are constantly added here while
 * transitioning the code base to TypeScript to quickly make the editor "happy"
 */
/// <reference path="electron.d.ts"/>

declare namespace Electron {
    namespace windowTransaction {
        export class Transaction extends WindowTransaction { }
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

    export namespace socketNet {
        export function socketRequest(url: string): any;
    }

    interface WebContents {
        fromProcessAndFrameIds: (processId: number, frameId: number) => WebContents;
        getOwnerBrowserWindow: () => BrowserWindow | void;
        mainFrameRoutingId: number;
        session: Session;
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
}
