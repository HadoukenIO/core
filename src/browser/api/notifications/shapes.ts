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
import NoteAction from './note_action';

// tslint:disable
const noop = function(){};
// tslint:enable

export interface Identity {
    name: string;
    uuid: string;
}

export interface NotificationMessage {
    action: NoteAction;
    id: Identity;
    data: any;
}

export interface AvailableRect {
    bottom: number;
    right: number;
}

export interface NotificationOptions {
    url: string;
    message?: string;
    timeout?: string | number;
    onClick?: () => any;
    onClose?: () => any;
    onDismiss?: () => any;
    onError?: () => any;
    onMessage?: () => any;
    onShow?: () => any;
}

export interface IdtoNameMap {
    [key: string]: any;
}

export interface NoteNameToParent {
    [key: string]: any;
}

export interface NameToNoteId {
    [key: string]: number;
}

export interface PendingNote {
    noteData: any;
    parent: any;
}

interface OfWindowOptions {
    alwaysOnTop: boolean;
    autoShow: boolean;
    contextMenu: boolean;
    cornerRounding: Object;
    defaultHeight: number;
    defaultWidth: number;
    draggable: boolean;
    frame: boolean;
    isNotification: boolean;
    maxHeight: number;
    maxWidth: number;
    name: string;
    opacity: number;
    resizable: boolean;
    resize: boolean;
    saveWindowState: boolean;
    showTaskbarIcon: boolean;
    state: string;
    url: string;
    message: string;
    timeout?: number | string;
}

// TODO this should be merged with the note class itself
export class NoteConfig {

    public windowOpts  = <OfWindowOptions> {
        alwaysOnTop: true,
        autoShow: true,
        contextMenu: true,
        cornerRounding: {
            height: 6,
            width: 6
        },
        defaultHeight: 80,
        defaultWidth: 300,
        draggable: false,
        frame: false,
        isNotification: true,
        maxHeight: 80,
        maxWidth: 300,
        message: '',
        // tslint:disable
        name: 'newNotifications' + Math.random(),
        // tslint:enable
        opacity: 0,
        resizable: false,
        resize: false,
        saveWindowState: false,
        showTaskbarIcon: false,
        state: 'normal',
        url: ''
    };

    public url: string;

    // TODO these should be typed
    public onClick: (data: any) => any;
    public onClose: (data: any) => any;
    public onDismiss: (data: any) => any;
    public onError: (data: any) => any;
    public onMessage: (data: any) => any;
    public onShow: (data: any) => any;

    constructor(opts: NotificationOptions) {

        if (!opts.url) {
            throw new Error('Notifications require a url');
        }

        // TODO use extend here? ...
        this.windowOpts.url = opts.url;
        this.windowOpts.message = opts.message || '';
        this.windowOpts.timeout = opts.timeout || 5000;

        this.onClick = opts.onClick || noop;
        this.onClose = opts.onClose || noop;
        this.onDismiss = opts.onDismiss || noop;
        this.onError = opts.onError || noop;
        this.onMessage = opts.onMessage || noop;
        this.onShow = opts.onShow || noop;
    }
}
