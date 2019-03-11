import { app as electronApp, ExternalWindow, WinEventHookEmitter } from 'electron';
import { Bounds } from '../../../js-adapter/src/shapes';
import { EventEmitter } from 'events';
import { extendNativeWindowInfo } from '../utils';
import { Identity } from '../../../js-adapter/src/identity';
import * as NativeWindowModule from './native_window';
import * as Shapes from '../../shapes';
import NativeWindowInjectionBus from '../transports/native_window_injection_bus';
import ofEvents from '../of_events';
import route from '../../common/route';
import WindowGroups from '../window_groups';

export const externalWindows = new Map<string, Shapes.ExternalWindow>();
const winEventHooksEmitters = new Map<string, WinEventHookEmitter>();
const nativeWindowInjectionBuses = new Map<string, NativeWindowInjectionBus>();

export async function addEventListener(identity: Identity, eventName: string, listener: Shapes.Listener): Promise<() => void> {
  const nativeWindow = getNativeWindow(identity);
  const emitterKey = getEmitterKey(nativeWindow);
  let globalWinEventHooksEmitter = winEventHooksEmitters.get('*');
  let winEventHooksEmitter = winEventHooksEmitters.get(emitterKey);
  let nativeWindowInjectionBus = nativeWindowInjectionBuses.get(emitterKey);

  // Global Windows' event hook emitters
  if (eventName === 'external-window-created' && !globalWinEventHooksEmitter) {
    globalWinEventHooksEmitter = subToGlobalWinEventHooks();
    winEventHooksEmitters.set('*', globalWinEventHooksEmitter);
  }

  // Windows' event hook emitters
  if (!winEventHooksEmitter) {
    winEventHooksEmitter = subToWinEventHooks(nativeWindow);
    winEventHooksEmitters.set(emitterKey, winEventHooksEmitter);
  }

  // Native window injection buses
  if (!nativeWindowInjectionBus) {
    nativeWindowInjectionBus = await subToNativeWindowInjectionEvents(nativeWindow, eventName);
    nativeWindowInjectionBuses.set(emitterKey, nativeWindowInjectionBus);
  }

  nativeWindow.on(eventName, listener);

  return () => nativeWindow.removeListener(eventName, listener);
}

export function animateExternalWindow(identity: Identity): void {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.noop(nativeWindow);
}

export function bringExternalWindowToFront(identity: Identity): void {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.bringToFront(nativeWindow);
}

export function closeExternalWindow(identity: Identity): void {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.close(nativeWindow);
}

export function disableExternalWindowFrame(identity: Identity): void {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.noop(nativeWindow);
}

export function enableExternaWindowFrame(identity: Identity): void {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.noop(nativeWindow);
}

export function flashExternalWindow(identity: Identity): void {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.flash(nativeWindow);
}

export function focusExternalWindow(identity: Identity): void {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.focus(nativeWindow);
}

export function getExternalWindowBounds(identity: Identity): Bounds {
  const nativeWindow = getNativeWindow(identity);
  return NativeWindowModule.getBounds(nativeWindow);
}

export function getExternalWindowGroup(identity: Identity): Shapes.GroupWindowIdentity[] {
  const nativeWindow = getNativeWindow(identity);
  const windowGroup = WindowGroups.getGroup(nativeWindow.groupUuid);
  return windowGroup.map(({ name, uuid, isExternalWindow }) => ({ name, uuid, windowName: name, isExternalWindow }));
}

export function getExternalWindowInfo(identity: Identity): Shapes.NativeWindowInfo {
  const { uuid } = identity;
  const rawNativeWindowInfo = electronApp.getNativeWindowInfoForNativeId(uuid);
  return extendNativeWindowInfo(rawNativeWindowInfo);
}

export function getExternalWindowState(identity: Identity): string {
  const nativeWindow = getNativeWindow(identity);
  return NativeWindowModule.getState(nativeWindow);
}

export function hideExternalWindow(identity: Identity): void {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.hide(nativeWindow);
}

export function isExternalWindowShowing(identity: Identity): boolean {
  const nativeWindow = getNativeWindow(identity);
  return NativeWindowModule.isVisible(nativeWindow);
}

export function joinExternalWindowGroup(identity: Identity, groupingIdentity: Identity): void {
  getNativeWindow(identity);
  WindowGroups.joinGroup(identity, groupingIdentity);
}

export function leaveExternalWindowGroup(identity: Identity): void {
  const nativeWindow = getNativeWindow(identity);
  WindowGroups.leaveGroup(nativeWindow);
}

export function maximizeExternalWindow(identity: Identity): void {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.maximize(nativeWindow);
}

export function mergeExternalWindowGroups(identity: Identity): void {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.noop(nativeWindow);
}

export function minimizeExternalWindow(identity: Identity): void {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.minimize(nativeWindow);
}

export function moveExternalWindowBy(identity: Identity, payload: Shapes.MoveWindowByOpts): void {
  const nativeWindow = getNativeWindow(identity);
  const windowInfo = getExternalWindowInfo(identity);
  NativeWindowModule.moveBy(nativeWindow, payload);
  emitBoundsChangedEvent(identity, windowInfo);
}

export function moveExternalWindow(identity: Identity, payload: Shapes.MoveWindowToOpts): void {
  const nativeWindow = getNativeWindow(identity);
  const windowInfo = getExternalWindowInfo(identity);
  NativeWindowModule.moveTo(nativeWindow, payload);
  emitBoundsChangedEvent(identity, windowInfo);
}

export function resizeExternalWindowBy(identity: Identity, payload: Shapes.ResizeWindowByOpts): void {
  const nativeWindow = getNativeWindow(identity);
  const windowInfo = getExternalWindowInfo(identity);
  NativeWindowModule.resizeBy(nativeWindow, payload);
  emitBoundsChangedEvent(identity, windowInfo);
}

export function resizeExternalWindowTo(identity: Identity, payload: Shapes.ResizeWindowToOpts): void {
  const nativeWindow = getNativeWindow(identity);
  const windowInfo = getExternalWindowInfo(identity);
  NativeWindowModule.resizeTo(nativeWindow, payload);
  emitBoundsChangedEvent(identity, windowInfo);
}

export function restoreExternalWindow(identity: Identity): void {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.restore(nativeWindow);
}

export function setExternalWindowAsForeground(identity: Identity): void {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.setAsForeground(nativeWindow);
}

export function setExternalWindowBounds(identity: Identity, payload: Bounds): void {
  const nativeWindow = getNativeWindow(identity);
  const windowInfo = getExternalWindowInfo(identity);
  NativeWindowModule.setBounds(nativeWindow, payload);
  emitBoundsChangedEvent(identity, windowInfo);
}

export function showExternalWindow(identity: Identity): void {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.show(nativeWindow);
}

export function showExternalWindowAt(identity: Identity, payload: Shapes.ShowWindowAtOpts): void {
  const nativeWindow = getNativeWindow(identity);
  const windowInfo = getExternalWindowInfo(identity);
  NativeWindowModule.showAt(nativeWindow, payload);
  emitBoundsChangedEvent(identity, windowInfo);
}

export function stopExternalWindowFlashing(identity: Identity): void {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.stopFlashing(nativeWindow);
}

/*
  Returns a key for emitter maps
*/
function getEmitterKey(nativeWindow: Shapes.ExternalWindow): string {
  const { nativeId } = nativeWindow;
  const pid = electronApp.getProcessIdForNativeId(nativeId);
  return `${pid}-${nativeId}`;
}

/*
  Returns a registered native window or creates a new one if not found.
*/
function getNativeWindow(identity: Identity): Shapes.ExternalWindow {
  const { uuid } = identity;
  let nativeWindow = externalWindows.get(uuid);

  if (!nativeWindow) {
    nativeWindow = <Shapes.ExternalWindow>(new ExternalWindow({ hwnd: uuid }));

    // This is needed for window grouping
    nativeWindow._options = {};
    nativeWindow.browserWindow = nativeWindow;
    nativeWindow.browserWindow._options = {};
    nativeWindow.isExternalWindow = true;
    nativeWindow.name = uuid;
    nativeWindow.uuid = uuid;
    //-----------------------------------

    externalWindows.set(uuid, nativeWindow);
  }

  return nativeWindow;
}

/*
  Emit "bounds-changed" event for a specific external window, if bounds changed.
*/
function emitBoundsChangedEvent(identity: Identity, previousNativeWindowInfoWindowInfo: Shapes.NativeWindowInfo): void {
  const nativeWindow = getNativeWindow(identity);
  const currentWindowInfo = getExternalWindowInfo(identity);
  const boundsChanged =
    previousNativeWindowInfoWindowInfo.bounds.height !== currentWindowInfo.bounds.height ||
    previousNativeWindowInfoWindowInfo.bounds.width !== currentWindowInfo.bounds.width ||
    previousNativeWindowInfoWindowInfo.bounds.x !== currentWindowInfo.bounds.x ||
    previousNativeWindowInfoWindowInfo.bounds.y !== currentWindowInfo.bounds.y;

  if (boundsChanged) {
    nativeWindow.once('bounds-changing', () => {
      nativeWindow.emit('bounds-changed', currentWindowInfo);
    });
  }
}

/*
  Subsribes to global win32 events
*/
function subToGlobalWinEventHooks(): WinEventHookEmitter {
  const winEventHooks = new WinEventHookEmitter();

  winEventHooks.on('EVENT_OBJECT_CREATE', (sender: EventEmitter, rawNativeWindowInfo: Shapes.RawNativeWindowInfo, timestamp: number) => {
    const windowInfo = extendNativeWindowInfo(rawNativeWindowInfo);
    ofEvents.emit(route.system('external-window-created'), windowInfo);
  });

  return winEventHooks;
}

/*
  Subscribe to win32 events and propogate appropriate events to native window.
*/
function subToWinEventHooks(nativeWindow: Shapes.ExternalWindow): WinEventHookEmitter {
  const { nativeId } = nativeWindow;
  const pid = electronApp.getProcessIdForNativeId(nativeId);
  const winEventHooks = new WinEventHookEmitter({ pid });

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
    nativeWindow.emit('shown', nativeWindowInfo);
  }));

  winEventHooks.on('EVENT_OBJECT_HIDE', listener.bind(null, (nativeWindowInfo: Shapes.NativeWindowInfo) => {
    nativeWindow.emit('hidden', nativeWindowInfo);
  }));

  winEventHooks.on('EVENT_OBJECT_DESTROY', listener.bind(null, (nativeWindowInfo: Shapes.NativeWindowInfo) => {
    const emitterKey = getEmitterKey(nativeWindow);
    const winEventHooksEmitter = winEventHooksEmitters.get(emitterKey);
    const nativeWindowInjectionBus = nativeWindowInjectionBuses.get(emitterKey);

    nativeWindow.emit('closing', nativeWindowInfo);
    winEventHooks.removeAllListeners();
    externalWindows.delete(nativeId);
    winEventHooksEmitters.delete(emitterKey);
    nativeWindow.emit('closed', nativeWindowInfo);
    nativeWindow.removeAllListeners();

    winEventHooksEmitter.removeAllListeners();
    winEventHooksEmitters.delete(emitterKey);

    nativeWindowInjectionBus.removeAllListeners();
    nativeWindowInjectionBuses.delete(emitterKey);
  }));

  winEventHooks.on('EVENT_OBJECT_FOCUS', listener.bind(null, (nativeWindowInfo: Shapes.NativeWindowInfo) => {
    nativeWindow.emit('focused', nativeWindowInfo);
  }));

  winEventHooks.on('EVENT_SYSTEM_MOVESIZESTART', listener.bind(null, (nativeWindowInfo: Shapes.NativeWindowInfo) => {
    nativeWindow.emit('begin-user-bounds-changing', nativeWindowInfo);
  }));

  winEventHooks.on('EVENT_SYSTEM_MOVESIZEEND', listener.bind(null, (nativeWindowInfo: Shapes.NativeWindowInfo) => {
    nativeWindow.emit('end-user-bounds-changing', nativeWindowInfo);
    nativeWindow.emit('bounds-changed', nativeWindowInfo);
  }));

  winEventHooks.on('EVENT_OBJECT_LOCATIONCHANGE', listener.bind(null, (nativeWindowInfo: Shapes.NativeWindowInfo) => {
    if (nativeWindowInfo.maximized && !previousNativeWindowInfo.maximized) {
      nativeWindow.emit('maximized', nativeWindowInfo);
    } else if (nativeWindowInfo.minimized && !previousNativeWindowInfo.minimized) {
      nativeWindow.emit('minimized', nativeWindowInfo);
    } else if (!nativeWindowInfo.maximized && previousNativeWindowInfo.maximized) {
      nativeWindow.emit('restored', nativeWindowInfo);
    } else if (!nativeWindowInfo.minimized && previousNativeWindowInfo.minimized) {
      nativeWindow.emit('restored', nativeWindowInfo);
    } else if (!nativeWindowInfo.minimized) {
      // Don't emit bounds-changing when the window is minimized, because it's
      // not being restored first automatically like for a maximized window,
      // and so the event is being triggerred even though the window's bounds
      // are not changing.
      nativeWindow.emit('bounds-changing', nativeWindowInfo);
    }
  }));

  return winEventHooks;
}

/*
  Subscribes to native window injection events
*/
async function subToNativeWindowInjectionEvents(nativeWindow: Shapes.ExternalWindow, eventName: string): Promise<NativeWindowInjectionBus> {
  const { nativeId } = nativeWindow;
  const pid = electronApp.getProcessIdForNativeId(nativeId);
  const nativeWindowInjectionBus = new NativeWindowInjectionBus({ nativeId, pid });

  await nativeWindowInjectionBus.on(eventName, (data) => {
    nativeWindow.emit(eventName, data);
  });

  return nativeWindowInjectionBus;
}
