import { app as electronApp, Rectangle } from 'electron';
import * as Shapes from '../shapes';
import ofEvents from './of_events';
import route from '../common/route';

let MonitorInfo: any;
electronApp.on('ready', () => {
    MonitorInfo = require('./monitor_info.js').default;
});

interface BoundsChangeEventData extends Shapes.CoordinatesXY {
    userMovement?: boolean;
}

export default class ExternalWindowEventAdapter {
    private _beginUserBoundsChangeEvent: string;
    private _beginUserBoundsChangeListener: (data: BoundsChangeEventData) => void;
    private _blurEvent: string;
    private _blurListener: () => void;
    private _boundsChangedEvent: string;
    private _boundsChangedListener: () => void;
    private _boundsChangingEvent: string;
    private _boundsChangingListener: (bounds: Shapes.Bounds) => void;
    private _closingEvent: string;
    private _closingListener: () => void;
    private _endUserBoundsChangeEvent: string;
    private _endUserBoundsChangeListener: () => void;
    private _focusEvent: string;
    private _focusListener: () => void;
    private _movingEvent: string;
    private _movingListener: () => void;
    private _sizingEvent: string;
    private _sizingListener: (bounds: Shapes.Bounds) => void;
    private _stateChangeEvent: string;
    private _stateChangeListener: () => void;
    private _visibilityChangedEvent: string;
    private _visibilityChangedListener: (isVisible: boolean) => void;

    private _addedAllListeners: boolean;
    private _boundsStart: null | Rectangle;
    private _changeType: number;
    private _cursorPrev: null | Shapes.CoordinatesXY;
    private _cursorStart: null | Shapes.CoordinatesXY;
    private _leftButtonDown: boolean;

    // tslint:disable-next-line
    constructor(browserWindow: Shapes.BrowserWindow | Shapes.ExternalWindow) {
        const options = browserWindow && browserWindow._options;
        const uuid = options.uuid;
        const name = options.name;

        this._boundsStart = null;
        this._cursorPrev = null;
        this._cursorStart = null;
        this._leftButtonDown = false;

        let cachedState = '';

        // Begin user bounds changing
        this._beginUserBoundsChangeEvent = route.externalWindow('begin-user-bounds-change', uuid, name);
        this._beginUserBoundsChangeListener = (data) => {
            const { userMovement, x, y } = data;
            const isUserMovementEnabled = typeof userMovement === 'boolean'
                ? userMovement
                : browserWindow.isUserMovementEnabled();

            if (!this._leftButtonDown && !isUserMovementEnabled) {
                const bounds = browserWindow.getBounds();

                // left mouse button is now in the down position
                this._leftButtonDown = true;
                // get current cursor position
                // todo: may need to convert screen to dpi
                this._cursorStart = { x, y };
                // save the disabled frame's previous cursor position
                this._cursorPrev = { x, y };
                // save the disabled frame's initial bounds
                this._boundsStart = bounds;
            }

            browserWindow.emit('begin-user-bounds-change');
        };

        // Blur
        this._blurEvent = route.externalWindow('blur', uuid, name);
        this._blurListener = () => {
            browserWindow.emit('blur');
        };

        // Bounds changed
        this._boundsChangedEvent = route.externalWindow('bounds-changed', uuid, name);
        this._boundsChangedListener = () => {
            browserWindow.emit('bounds-changed');
        };

        // Bounds changing
        this._boundsChangingEvent = route.externalWindow('bounds-changing', uuid, name);
        this._boundsChangingListener = (bounds) => {
            browserWindow.emit('bounds-changing', bounds);
        };

        // Closing
        this._closingEvent = route.externalWindow('close', uuid, name);
        this._closingListener = () => {
            browserWindow.emit('close');
            browserWindow.emit('will-close');

            // ToDo: Determine if 'closed' is emitted twice on the external BrowserWindows
            browserWindow.close();
            browserWindow.emit('closed');
        };

        // End user bounds change
        this._endUserBoundsChangeEvent = route.externalWindow('end-user-bounds-change', uuid, name);
        this._endUserBoundsChangeListener = () => {
            if (this._leftButtonDown) {
                if (this._changeType !== -1) {
                    const bounds = browserWindow.getBounds();
                    browserWindow.emit('disabled-frame-bounds-changed', {}, bounds, this._changeType);
                }

                // reset
                this._leftButtonDown = false;
                this._changeType = -1;
            }

            browserWindow.emit('end-user-bounds-change');
        };

        // Focus
        this._focusEvent = route.externalWindow('focus', uuid, name);
        this._focusListener = () => {
            browserWindow.emit('focus');
        };

        // Moving
        this._movingEvent = route.externalWindow('moving', uuid, name);
        this._movingListener = () => {
            if (this._leftButtonDown) {
                const { left, top } = MonitorInfo.getMousePosition();
                const cursorCurr = { x: left, y: top };

                this._changeType = 0;

                // get the cursor delta
                const xCursorDelta = cursorCurr.x - this._cursorPrev.x;
                const yCursorDelta = cursorCurr.y - this._cursorPrev.y;

                if (xCursorDelta !== 0 || yCursorDelta !== 0) {
                    const bounds = browserWindow.getBounds();

                    bounds.x = (cursorCurr.x - this._cursorStart.x) + this._boundsStart.x;
                    bounds.y = (cursorCurr.y - this._cursorStart.y) + this._boundsStart.y;

                    browserWindow.emit('disabled-frame-bounds-changing', {}, bounds, this._changeType);

                    this._cursorPrev = cursorCurr;
                }
            } else {
                browserWindow.emit('bounds-changed');
            }
        };

        // Sizing
        this._sizingEvent = route.externalWindow('sizing', uuid, name);
        this._sizingListener = (bounds) => {
            if (this._leftButtonDown) {
                // check if the position has also changed by checking whether the origins match up
                if (this._changeType !== 2) {
                    const xDelta = bounds.x !== this._boundsStart.x;
                    const yDelta = bounds.y !== this._boundsStart.y;

                    this._changeType = xDelta || yDelta ? 2 : 1;
                }

                browserWindow.emit('disabled-frame-bounds-changing', {}, bounds, this._changeType);
            }
        };

        // State changed
        this._stateChangeEvent = route.externalWindow('state-change', uuid, name);
        this._stateChangeListener = () => {
            const prevState = cachedState || 'normal';
            let currState = 'normal';

            if (browserWindow.isMinimized()) {
                currState = 'minimized';
            } else if (browserWindow.isMaximized()) {
                currState = 'maximized';
            }

            if (prevState !== currState) {
                if (currState === 'minimized') {
                    browserWindow.emit('minimize');
                } else if (currState === 'maximized') {
                    browserWindow.emit('maximize');
                } else {
                    browserWindow.emit('restore');
                }

                cachedState = currState;
            }
        };

        // Visibility changed
        this._visibilityChangedEvent = route.externalWindow('visibility-changed', uuid, name);
        this._visibilityChangedListener = (isVisible) => {
            browserWindow.emit('visibility-changed', {}, isVisible);
        };

        this.addAllListeners();
    }

    public addAllListeners = (): void => {
        if (this._addedAllListeners) {
            return;
        }

        ofEvents.on(this._beginUserBoundsChangeEvent, this._beginUserBoundsChangeListener);
        ofEvents.on(this._blurEvent, this._blurListener);
        ofEvents.on(this._boundsChangedEvent, this._boundsChangedListener);
        ofEvents.on(this._boundsChangingEvent, this._boundsChangingListener);
        ofEvents.on(this._closingEvent, this._closingListener);
        ofEvents.on(this._endUserBoundsChangeEvent, this._endUserBoundsChangeListener);
        ofEvents.on(this._focusEvent, this._focusListener);
        ofEvents.on(this._movingEvent, this._movingListener);
        ofEvents.on(this._sizingEvent, this._sizingListener);
        ofEvents.on(this._stateChangeEvent, this._stateChangeListener);
        ofEvents.on(this._visibilityChangedEvent, this._visibilityChangedListener);

        this._addedAllListeners = true;
    }

    public removeAllListeners = (): void => {
        ofEvents.removeListener(this._beginUserBoundsChangeEvent, this._beginUserBoundsChangeListener);
        ofEvents.removeListener(this._blurEvent, this._blurListener);
        ofEvents.removeListener(this._boundsChangedEvent, this._boundsChangedListener);
        ofEvents.removeListener(this._boundsChangingEvent, this._boundsChangingListener);
        ofEvents.removeListener(this._closingEvent, this._closingListener);
        ofEvents.removeListener(this._endUserBoundsChangeEvent, this._endUserBoundsChangeListener);
        ofEvents.removeListener(this._focusEvent, this._focusListener);
        ofEvents.removeListener(this._movingEvent, this._movingListener);
        ofEvents.removeListener(this._sizingEvent, this._sizingListener);
        ofEvents.removeListener(this._stateChangeEvent, this._stateChangeListener);
        ofEvents.removeListener(this._visibilityChangedEvent, this._visibilityChangedListener);

        this._addedAllListeners = false;
    }
}
