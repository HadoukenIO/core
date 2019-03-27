const ExternalWindowEventAdapter = require('../external_window_event_adapter');
import { app as electronApp, ExternalWindow, WinEventHookEmitter } from 'electron';
import { Bounds } from '../../../js-adapter/src/shapes';
import { EventEmitter } from 'events';
import { extendNativeWindowInfo } from '../utils';
import { Identity } from '../../../js-adapter/src/identity';
import { OF_EVENT_FROM_WINDOWS_MESSAGE } from '../../common/windows_messages';
import * as NativeWindowModule from './native_window';
import * as Shapes from '../../shapes';
import InjectionBus from '../transports/injection_bus';
import ofEvents from '../of_events';
import route from '../../common/route';
import WindowGroups from '../window_groups';

export const externalWindows = new Map<string, Shapes.ExternalWindow>();
const winEventHooksEmitters = new Map<string, WinEventHookEmitter>();
const injectionBuses = new Map<string, InjectionBus>();

export async function addEventListener(identity: Identity, eventName: string, listener: Shapes.Listener): Promise<() => void> {
  const externalWindow = getExternalWindow(identity);
  externalWindow.on(eventName, listener);
  return () => externalWindow.removeListener(eventName, listener);
}

export function animateExternalWindow(identity: Identity): void {
  const externalWindow = getExternalWindow(identity);
  NativeWindowModule.noop(externalWindow);
}

export function bringExternalWindowToFront(identity: Identity): void {
  const externalWindow = getExternalWindow(identity);
  NativeWindowModule.bringToFront(externalWindow);
}

export function closeExternalWindow(identity: Identity): void {
  const externalWindow = getExternalWindow(identity);
  NativeWindowModule.close(externalWindow);
}

export async function disableExternalWindowUserMovement(identity: Identity): Promise<void> {
  const externalWindow = getExternalWindow(identity);
  const injectionBus = getInjectionBus(externalWindow);
  await injectionBus.set({ userMovement: false });
  externalWindow.emit('user-movement-disabled');
  // TODO: enable user movement when requestors go away
}

export async function enableExternaWindowUserMovement(identity: Identity): Promise<void> {
  const externalWindow = getExternalWindow(identity);
  const injectionBus = getInjectionBus(externalWindow);
  await injectionBus.set({ userMovement: true });
  externalWindow.emit('user-movement-enabled');
}

export function flashExternalWindow(identity: Identity): void {
  const externalWindow = getExternalWindow(identity);
  NativeWindowModule.flash(externalWindow);
}

export function focusExternalWindow(identity: Identity): void {
  const externalWindow = getExternalWindow(identity);
  NativeWindowModule.focus(externalWindow);
}

export function getExternalWindowBounds(identity: Identity): Bounds {
  const externalWindow = getExternalWindow(identity);
  return NativeWindowModule.getBounds(externalWindow);
}

export function getExternalWindowGroup(identity: Identity): Shapes.GroupWindowIdentity[] {
  const externalWindow = getExternalWindow(identity);
  const windowGroup = WindowGroups.getGroup(externalWindow.groupUuid);
  return windowGroup.map(({ name, uuid, isExternalWindow }) => ({ name, uuid, windowName: name, isExternalWindow }));
}

export function getExternalWindowInfo(identity: Identity): Shapes.NativeWindowInfo {
  const { uuid } = identity;
  const rawNativeWindowInfo = electronApp.getNativeWindowInfoForNativeId(uuid);
  return extendNativeWindowInfo(rawNativeWindowInfo);
}

export function getExternalWindowOptions(identity: Identity): any {
  const externalWindow = getExternalWindow(identity);
  return externalWindow._options;
}

export function getExternalWindowState(identity: Identity): string {
  const externalWindow = getExternalWindow(identity);
  return NativeWindowModule.getState(externalWindow);
}

export function hideExternalWindow(identity: Identity): void {
  const externalWindow = getExternalWindow(identity);
  NativeWindowModule.hide(externalWindow);
}

export function isExternalWindowShowing(identity: Identity): boolean {
  const externalWindow = getExternalWindow(identity);
  return NativeWindowModule.isVisible(externalWindow);
}

export function joinExternalWindowGroup(identity: Identity, groupingIdentity: Identity): void {
  getExternalWindow(identity);
  WindowGroups.joinGroup(identity, groupingIdentity);
}

export function leaveExternalWindowGroup(identity: Identity): void {
  const externalWindow = getExternalWindow(identity);
  WindowGroups.leaveGroup(externalWindow);
}

export function maximizeExternalWindow(identity: Identity): void {
  const externalWindow = getExternalWindow(identity);
  NativeWindowModule.maximize(externalWindow);
}

export function mergeExternalWindowGroups(identity: Identity, groupingIdentity: Identity): void {
  getExternalWindow(identity);
  WindowGroups.mergeGroups(identity, groupingIdentity);
}

export function minimizeExternalWindow(identity: Identity): void {
  const externalWindow = getExternalWindow(identity);
  NativeWindowModule.minimize(externalWindow);
}

export function moveExternalWindowBy(identity: Identity, payload: Shapes.MoveWindowByOpts): void {
  const externalWindow = getExternalWindow(identity);
  const windowInfo = getExternalWindowInfo(identity);
  NativeWindowModule.moveBy(externalWindow, payload);
  emitBoundsChangedEvent(identity, windowInfo);
}

export function moveExternalWindow(identity: Identity, payload: Shapes.MoveWindowToOpts): void {
  const externalWindow = getExternalWindow(identity);
  const windowInfo = getExternalWindowInfo(identity);
  NativeWindowModule.moveTo(externalWindow, payload);
  emitBoundsChangedEvent(identity, windowInfo);
}

export function registerNativeExternalWindow(identity: Identity): void {
  getExternalWindow(identity);
}

export function resizeExternalWindowBy(identity: Identity, payload: Shapes.ResizeWindowByOpts): void {
  const externalWindow = getExternalWindow(identity);
  const windowInfo = getExternalWindowInfo(identity);
  NativeWindowModule.resizeBy(externalWindow, payload);
  emitBoundsChangedEvent(identity, windowInfo);
}

export function resizeExternalWindowTo(identity: Identity, payload: Shapes.ResizeWindowToOpts): void {
  const externalWindow = getExternalWindow(identity);
  const windowInfo = getExternalWindowInfo(identity);
  NativeWindowModule.resizeTo(externalWindow, payload);
  emitBoundsChangedEvent(identity, windowInfo);
}

export function restoreExternalWindow(identity: Identity): void {
  const externalWindow = getExternalWindow(identity);
  NativeWindowModule.restore(externalWindow);
}

export function setExternalWindowAsForeground(identity: Identity): void {
  const externalWindow = getExternalWindow(identity);
  NativeWindowModule.setAsForeground(externalWindow);
}

export function setExternalWindowBounds(identity: Identity, payload: Bounds): void {
  const externalWindow = getExternalWindow(identity);
  const windowInfo = getExternalWindowInfo(identity);
  NativeWindowModule.setBounds(externalWindow, payload);
  emitBoundsChangedEvent(identity, windowInfo);
}

export function showExternalWindowAt(identity: Identity, payload: Shapes.ShowWindowAtOpts): void {
  const externalWindow = getExternalWindow(identity);
  const windowInfo = getExternalWindowInfo(identity);
  NativeWindowModule.showAt(externalWindow, payload);
  emitBoundsChangedEvent(identity, windowInfo);
}

export function showExternalWindow(identity: Identity): void {
  const externalWindow = getExternalWindow(identity);
  NativeWindowModule.show(externalWindow);
}

export function stopExternalWindowFlashing(identity: Identity): void {
  const externalWindow = getExternalWindow(identity);
  NativeWindowModule.stopFlashing(externalWindow);
}

export function updateExternalWindowOptions(identity: Identity, options: object): void {
  getExternalWindow(identity);
  // TODO
}

/*
  Returns a key for emitter maps
*/
function getEmitterKey(externalWindow: Shapes.ExternalWindow): string {
  const { nativeId } = externalWindow;
  const pid = electronApp.getProcessIdForNativeId(nativeId);
  return `${pid}-${nativeId}`;
}

/*
  Returns a registered native window or creates a new one if not found.
*/
export function getExternalWindow(identity: Identity): Shapes.ExternalWindow {
  const { uuid } = identity;
  let externalWindow = externalWindows.get(uuid);

  if (!externalWindow) {
    externalWindow = <Shapes.ExternalWindow>(new ExternalWindow({ hwnd: uuid }));

    // Window grouping stub
    applyWindowGroupingStub(externalWindow);

    // Injection events subscription
    subscribeToInjectionEvents(externalWindow);

    // Windows event hooks subscriptions
    subToWinEventHooks(externalWindow);
    subToGlobalWinEventHooks();

    externalWindows.set(uuid, externalWindow);
  }

  return externalWindow;
}

/*
  Gets (creates when missing) injection bus for specified external window
*/
function getInjectionBus(externalWindow: Shapes.ExternalWindow): InjectionBus {
  const emitterKey = getEmitterKey(externalWindow);
  let injectionBus = injectionBuses.get(emitterKey);

  if (!injectionBus) {
    const { nativeId } = externalWindow;
    const pid = electronApp.getProcessIdForNativeId(nativeId);
    const eventAddapter = new ExternalWindowEventAdapter(externalWindow);
    injectionBus = new InjectionBus({ nativeId, pid });
    injectionBuses.set(emitterKey, injectionBus);
  }

  return injectionBus;
}

/*
  Emit "bounds-changed" event for a specific external window, if bounds changed.
*/
function emitBoundsChangedEvent(identity: Identity, previousNativeWindowInfo: Shapes.NativeWindowInfo): void {
  const externalWindow = getExternalWindow(identity);
  const currentWindowInfo = getExternalWindowInfo(identity);
  const boundsChanged =
    previousNativeWindowInfo.bounds.height !== currentWindowInfo.bounds.height ||
    previousNativeWindowInfo.bounds.width !== currentWindowInfo.bounds.width ||
    previousNativeWindowInfo.bounds.x !== currentWindowInfo.bounds.x ||
    previousNativeWindowInfo.bounds.y !== currentWindowInfo.bounds.y;

  if (boundsChanged) {
    externalWindow.once('bounds-changing', () => {
      externalWindow.emit('bounds-changed', {
        changeType: 0, // TODO: use real value
        // deferred: false, // TODO
        height: currentWindowInfo.bounds.height,
        left: currentWindowInfo.bounds.x,
        // reason: 'self', // TODO
        top: currentWindowInfo.bounds.y,
        width: currentWindowInfo.bounds.width
      });
    });
  }
}

/*
  Subsribes to global win32 events
*/
function subToGlobalWinEventHooks(): void {
  if (winEventHooksEmitters.has('*')) {
    // Already subscribed to global hooks
    return;
  }

  const winEventHooks = new WinEventHookEmitter();

  winEventHooks.on('EVENT_OBJECT_CREATE', (sender: EventEmitter, rawNativeWindowInfo: Shapes.RawNativeWindowInfo, timestamp: number) => {
    const windowInfo = extendNativeWindowInfo(rawNativeWindowInfo);
    ofEvents.emit(route.system('external-window-created'), windowInfo);
  });

  winEventHooksEmitters.set('*', winEventHooks);
}

/*
  Subscribe to win32 events and propogate appropriate events to native window.
*/
// tslint:disable-next-line
function subToWinEventHooks(externalWindow: Shapes.ExternalWindow): void {
  const { nativeId } = externalWindow;
  const pid = electronApp.getProcessIdForNativeId(nativeId);
  const emitterKey = getEmitterKey(externalWindow);
  const winEventHooks = new WinEventHookEmitter({ pid });
  winEventHooksEmitters.set(emitterKey, winEventHooks);

  let previousNativeWindowInfo = electronApp.getNativeWindowInfoForNativeId(nativeId);

  const listener = (
    parser: (nativeWindowInfo: Shapes.NativeWindowInfo) => void,
    sender: EventEmitter,
    rawNativeWindowInfo: Shapes.RawNativeWindowInfo,
    timestamp: number
  ): void => {
    const nativeWindowInfo = extendNativeWindowInfo(rawNativeWindowInfo);

    // Since we are subscribing to a process, we are only interested in a
    // specific window.
    if (nativeWindowInfo.uuid !== nativeId) {
      return;
    }

    parser(nativeWindowInfo);
    previousNativeWindowInfo = nativeWindowInfo;
  };

  winEventHooks.on('EVENT_OBJECT_SHOW', listener.bind(null, (nativeWindowInfo: Shapes.NativeWindowInfo) => {
    externalWindow.emit('shown');
  }));

  winEventHooks.on('EVENT_OBJECT_HIDE', listener.bind(null, (nativeWindowInfo: Shapes.NativeWindowInfo) => {
    externalWindow.emit('hidden', {
      reason: 'hide' // TOOD: use real value
    });
  }));

  winEventHooks.on('EVENT_OBJECT_DESTROY', listener.bind(null, (nativeWindowInfo: Shapes.NativeWindowInfo) => {
    const emitterKey = getEmitterKey(externalWindow);
    const injectionBus = injectionBuses.get(emitterKey);

    externalWindow.emit('closing');

    winEventHooks.removeAllListeners();
    winEventHooksEmitters.delete(emitterKey);

    injectionBus.removeAllListeners();
    injectionBuses.delete(emitterKey);

    externalWindow.emit('closed');
    externalWindow.removeAllListeners();
    externalWindows.delete(nativeId);
  }));

  winEventHooks.on('EVENT_OBJECT_FOCUS', listener.bind(null, (nativeWindowInfo: Shapes.NativeWindowInfo) => {
    externalWindow.emit('focused');
  }));

  winEventHooks.on('EVENT_SYSTEM_MOVESIZESTART', listener.bind(null, (nativeWindowInfo: Shapes.NativeWindowInfo) => {
    externalWindow.emit('begin-user-bounds-changing', {
      frame: true, // TODO: use real value
      height: nativeWindowInfo.bounds.height,
      left: nativeWindowInfo.bounds.x,
      top: nativeWindowInfo.bounds.y,
      width: nativeWindowInfo.bounds.width,
      windowState: 'normal', // TODO: use real value
      x: nativeWindowInfo.bounds.x,
      y: nativeWindowInfo.bounds.y
    });
  }));

  winEventHooks.on('EVENT_SYSTEM_MOVESIZEEND', listener.bind(null, (nativeWindowInfo: Shapes.NativeWindowInfo) => {
    externalWindow.emit('end-user-bounds-changing', {
      frame: true, // TODO: use real value
      height: nativeWindowInfo.bounds.height,
      left: nativeWindowInfo.bounds.x,
      top: nativeWindowInfo.bounds.y,
      width: nativeWindowInfo.bounds.width,
      windowState: 'normal', // TODO: use real value
      x: nativeWindowInfo.bounds.x,
      y: nativeWindowInfo.bounds.y
    });
    externalWindow.emit('bounds-changed', {
      changeType: 0, // TODO: use real value
      // deferred: false, // TODO
      height: nativeWindowInfo.bounds.height,
      left: nativeWindowInfo.bounds.x,
      // reason: 'self', // TODO
      top: nativeWindowInfo.bounds.y,
      width: nativeWindowInfo.bounds.width
    });
  }));

  winEventHooks.on('EVENT_OBJECT_LOCATIONCHANGE', listener.bind(null, (nativeWindowInfo: Shapes.NativeWindowInfo) => {
    if (nativeWindowInfo.maximized && !previousNativeWindowInfo.maximized) {
      externalWindow.emit('maximized');
    } else if (nativeWindowInfo.minimized && !previousNativeWindowInfo.minimized) {
      externalWindow.emit('minimized');
    } else if (!nativeWindowInfo.maximized && previousNativeWindowInfo.maximized) {
      externalWindow.emit('restored');
    } else if (!nativeWindowInfo.minimized && previousNativeWindowInfo.minimized) {
      externalWindow.emit('restored');
    } else if (!nativeWindowInfo.minimized) {
      // Don't emit bounds-changing when the window is minimized, because it's
      // not being restored first automatically like for a maximized window,
      // and so the event is being triggerred even though the window's bounds
      // are not changing.
      externalWindow.emit('bounds-changing', {
        changeType: 0, // TODO: use real value
        // deferred: false, // TODO
        height: nativeWindowInfo.bounds.height,
        left: nativeWindowInfo.bounds.x,
        // reason: 'self', // TODO
        top: nativeWindowInfo.bounds.y,
        width: nativeWindowInfo.bounds.width
      });
    }
  }));
}

// Window grouping stub (makes external windows work with our original disabled frame group tracker)
// Also some of the _options' values are needed in OpenFin Layouts
function applyWindowGroupingStub(externalWindow: Shapes.ExternalWindow): Shapes.GroupWindow {
  const { nativeId } = externalWindow;
  const identity = { uuid: nativeId };

  externalWindow._options = {
    alwaysOnTop: false,
    frame: true,
    maximizable: true,
    name: nativeId,
    opacity: 1,
    resizable: true,
    showTaskbarIcon: true,
    uuid: nativeId
  };
  externalWindow.browserWindow = externalWindow;
  externalWindow.isExternalWindow = true;
  externalWindow.name = nativeId;
  externalWindow.uuid = nativeId;
  externalWindow.isUserMovementEnabled = () => false;
  externalWindow.setUserMovementEnabled = async (enableUserMovement: boolean): Promise<void> => {
    if (enableUserMovement) {
      await enableExternaWindowUserMovement(identity);
    } else {
      await disableExternalWindowUserMovement(identity);
    }
  };

  return externalWindow;
}

// Subscribe to all injection events
async function subscribeToInjectionEvents(externalWindow: Shapes.ExternalWindow): Promise<void> {
  const { uuid, name } = externalWindow;
  const injectionBus = getInjectionBus(externalWindow);

  injectionBus.on('WM_SIZING', (data: any) => {
    const { bottom, left, right, top } = data;
    const bounds = { x: left, y: top, width: right - left, height: bottom - top };
    const routeName = route.externalWindow(OF_EVENT_FROM_WINDOWS_MESSAGE.WM_SIZING, uuid, name);
    ofEvents.emit(routeName, bounds);
    if (!externalWindow.isUserMovementEnabled()) {
      externalWindow.emit('disabled-movement-bounds-changing');
    }
  });

  injectionBus.on('WM_MOVING', () => {
    const routeName = route.externalWindow(OF_EVENT_FROM_WINDOWS_MESSAGE.WM_MOVING, uuid, name);
    ofEvents.emit(routeName);
    if (!externalWindow.isUserMovementEnabled()) {
      externalWindow.emit('disabled-movement-bounds-changing');
    }
  });

  injectionBus.on('WM_ENTERSIZEMOVE', (data: any) => {
    const { mouseX, mouseY } = data;
    const coordinates = { x: mouseX, y: mouseY };
    const routeName = route.externalWindow(OF_EVENT_FROM_WINDOWS_MESSAGE.WM_ENTERSIZEMOVE, uuid, name);
    ofEvents.emit(routeName, coordinates);
  });

  injectionBus.on('WM_EXITSIZEMOVE', () => {
    const routeName = route.externalWindow(OF_EVENT_FROM_WINDOWS_MESSAGE.WM_EXITSIZEMOVE, uuid, name);
    ofEvents.emit(routeName);
    if (!externalWindow.isUserMovementEnabled()) {
      externalWindow.emit('disabled-movement-bounds-changed');
    }
  });

  injectionBus.on('WM_KILLFOCUS', (data) => {
    externalWindow.emit('blurred', data);
  });
}
