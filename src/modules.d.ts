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
/**
 * All declared modules in this file don't correctly represent all of
 * their functionality, rather things are constantly added here while
 * transitioning the code base to TypeScript to quickly make the editor "happy"
 */

declare module 'electron' {
    namespace app {
        export function generateGUID(): string;
        export function getCommandLineArguments(): string;
        export function getCommandLineArgv(): string[];
        export function getPath(str: string): string;
        export function getTickCount(): number;
        export function log(level: string, message: any): any;
        export function on(event: string, callback: () => void): void;
        export function setMinLogLevel(level: number): void;
        export function vlog(level: number, message: any): any;
    }

    namespace BrowserWindow {
        export function fromId(id: string): any;
    }

    export class BrowserWindow {
        constructor(props: any);
        _options: {
            minWidth: number;
            minHeight: number;
            maxWidth: number;
            maxHeight: number;
        };
        on(eventName: string, listener: (a: any, wnd: any, msg: any) => any): any;
        getWindowsByClassName(className: string): any;
        sendMessageToWindowByHwnd(hWnd: string, timeout: number, data: string): any;
        hookWindowMessage(n: number, listener: (message: any) => void): void;
        subscribeSessionNotifications(b: boolean): void;
        isDestroyed(): boolean;
    }

    export class ipcMain {

    }

    export interface ClientResponse {
        on(eventName: string, event: (data?: any) => void): void;
        statusCode: number;
        headers: { [key: string]: any }[];
    }

    export interface ClientRequest {
        on(eventName: string, event: (response: ClientResponse | Error) => void): void;
        end(): void;
    }

    export interface clientRequestOptions {
        method?: string;
        url?: string;
        session?: object;
        partition?: string;
        protocol?: string;
        host?: string;
        hostname?: string;
        port?: number;
        path?: string;
        redirect?: string;
    }

    namespace net {
        export function request(options: clientRequestOptions | string): ClientRequest;
    }

    export class resourceFetcher {
        constructor(type: string);
        on(event: string, callback: (event: string, status: string) => any): void;
        once(event: string, callback: (event: string, status: string) => any): void;
        setFilePath(path: string): void;
        fetch(url: string): void;
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
    }

    export class nativeTimer {
        constructor(action: () => void, intervalTime: number);
        public stop(): void;
        public reset(): void;
        public isRunning(): boolean;
    }

    namespace clipboard {
        export function write(data: {text?: string; html?: string; rtf?: string;}, type?: string): void;
        export function writeRtf(data: string, type?: string): void;
        export function writeHtml(data: string, type?: string): void;
        export function writeText(data: string, type?: string): void;
        export function availableFormats(type?: string): string[];
        export function clear(type?: string): void;
        export function readRtf(type?: string): string;
        export function readHtml(type?: string): string;
        export function readText(type?: string): string;
    }
}
