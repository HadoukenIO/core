import { noop } from '../../../common/main';
import NoteAction from './note_action';

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
    cornerRounding: object;
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
