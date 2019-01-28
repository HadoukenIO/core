import { app as electronApp, BrowserWindow, winEventHookEmitter } from 'electron';
import { Bounds } from '../../../js-adapter/src/shapes';
import { extendNativeWindowInfo } from '../utils';
import { Identity } from '../../../js-adapter/src/identity';
import * as NativeWindowModule from './native_window';
import * as Shapes from '../../shapes';
import ofEvents from '../of_events';
import route from '../../common/route';
import { extendNativeWindowInfo } from '../utils';

const registeredExternalWindows = new Map<string, BrowserWindow>();

export function addEventListener(identity: Shapes.Identity, type: string, listener: Shapes.Listener) {
  const evt = route.externalWindow(type, identity.uuid);
  ofEvents.on(evt, listener);
  return () => ofEvents.removeListener(evt, listener);
}

export function animateExternalWindow(identity: Identity) {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.noop(nativeWindow);
}

export function bringExternalWindowToFront(identity: Identity) {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.bringToFront(nativeWindow);
}

export function closeExternalWindow(identity: Identity) {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.close(nativeWindow);
}

export function disableExternalWindowFrame(identity: Identity) {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.noop(nativeWindow);
}

export function enableExternaWindowFrame(identity: Identity) {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.noop(nativeWindow);
}

export function flashExternalWindow(identity: Identity) {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.flash(nativeWindow);
}

export function focusExternalWindow(identity: Identity) {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.focus(nativeWindow);
}

export function getExternalWindowBounds(identity: Identity) {
  const nativeWindow = getNativeWindow(identity);
  return NativeWindowModule.getBounds(nativeWindow);
}

export function getExternalWindowGroup(identity: Identity) {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.noop(nativeWindow);
}

export function getExternalWindowInfo(identity: Identity): Shapes.RawNativeWindowInfo {
  const { uuid } = identity;
  const rawNativeWindowInfo = electronApp.getNativeWindowInfoForNativeId(uuid);
  const nativeWindowInfo = extendNativeWindowInfo(rawNativeWindowInfo)
  return nativeWindowInfo;
}

export function getExternalWindowState(identity: Identity) {
  const nativeWindow = getNativeWindow(identity);
  return NativeWindowModule.getState(nativeWindow);
}

export function hideExternalWindow(identity: Identity) {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.hide(nativeWindow);
}

export function isExternalWindowShowing(identity: Identity) {
  const nativeWindow = getNativeWindow(identity);
  return NativeWindowModule.isVisible(nativeWindow);
}

export function joinExternalWindowGroup(identity: Identity) {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.noop(nativeWindow);
}

export function leaveExternalWindowGroup(identity: Identity) {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.noop(nativeWindow);
}

export function maximizeExternalWindow(identity: Identity) {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.maximize(nativeWindow);
}

export function mergeExternalWindowGroups(identity: Identity) {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.noop(nativeWindow);
}

export function minimizeExternalWindow(identity: Identity) {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.minimize(nativeWindow);
}

export function moveExternalWindowBy(identity: Identity, payload: Shapes.MoveWindowByOpts) {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.moveBy(nativeWindow, payload);
}

export function moveExternalWindow(identity: Identity, payload: Shapes.MoveWindowToOpts) {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.moveTo(nativeWindow, payload);
}

export function resizeExternalWindowBy(identity: Identity, payload: Shapes.ResizeWindowByOpts) {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.resizeBy(nativeWindow, payload);
}

export function resizeExternalWindowTo(identity: Identity, payload: Shapes.ResizeWindowToOpts) {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.resizeTo(nativeWindow, payload);
}

export function restoreExternalWindow(identity: Identity) {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.restore(nativeWindow);
}

export function setExternalWindowAsForeground(identity: Identity) {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.setAsForeground(nativeWindow);
}

export function setExternalWindowBounds(identity: Identity, payload: Bounds) {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.setBounds(nativeWindow, payload);
}

export function showExternalWindow(identity: Identity) {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.show(nativeWindow);
}

export function showExternalWindowAt(identity: Identity, payload: Shapes.ShowWindowAtOpts) {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.showAt(nativeWindow, payload);
}

export function stopExternalWindowFlashing(identity: Identity) {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.stopFlashing(nativeWindow);
}

function getNativeWindow(identity: Identity) {
  const { uuid } = identity;
  let nativeWindow = registeredExternalWindows.get(uuid);

  if (!nativeWindow) {
    nativeWindow = new BrowserWindow({ hwnd: uuid });
    // TODO: add nativeWindow destruction
    registeredExternalWindows.set(uuid, nativeWindow);
  }

  return nativeWindow;
}
