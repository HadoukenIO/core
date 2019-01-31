import { app as electronApp, BrowserWindow } from 'electron';
import { Bounds } from '../../../js-adapter/src/shapes';
import { extendNativeWindowInfo } from '../utils';
import { Identity } from '../../../js-adapter/src/identity';
import * as NativeWindowModule from './native_window';
import * as Shapes from '../../shapes';
import ofEvents from '../of_events';
import route from '../../common/route';

export const registeredExternalWindows = new Map<string, BrowserWindow>();

export function addEventListener(identity: Shapes.Identity, type: string, listener: Shapes.Listener): Shapes.Func {
  const evt = route.externalWindow(type, identity.uuid);
  ofEvents.on(evt, listener);
  return () => ofEvents.removeListener(evt, listener);
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

export function getExternalWindowGroup(identity: Identity): void {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.noop(nativeWindow);
}

export function getExternalWindowInfo(identity: Identity): Shapes.RawNativeWindowInfo {
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

export function joinExternalWindowGroup(identity: Identity): void {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.noop(nativeWindow);
}

export function leaveExternalWindowGroup(identity: Identity): void {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.noop(nativeWindow);
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
  NativeWindowModule.moveBy(nativeWindow, payload);
}

export function moveExternalWindow(identity: Identity, payload: Shapes.MoveWindowToOpts): void {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.moveTo(nativeWindow, payload);
}

export function resizeExternalWindowBy(identity: Identity, payload: Shapes.ResizeWindowByOpts): void {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.resizeBy(nativeWindow, payload);
}

export function resizeExternalWindowTo(identity: Identity, payload: Shapes.ResizeWindowToOpts): void {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.resizeTo(nativeWindow, payload);
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
  NativeWindowModule.setBounds(nativeWindow, payload);
}

export function showExternalWindow(identity: Identity): void {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.show(nativeWindow);
}

export function showExternalWindowAt(identity: Identity, payload: Shapes.ShowWindowAtOpts): void {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.showAt(nativeWindow, payload);
}

export function stopExternalWindowFlashing(identity: Identity): void {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.stopFlashing(nativeWindow);
}

function getNativeWindow(identity: Identity): BrowserWindow {
  const { uuid } = identity;
  let nativeWindow = registeredExternalWindows.get(uuid);

  if (!nativeWindow) {
    nativeWindow = new BrowserWindow({ hwnd: uuid });
    registeredExternalWindows.set(uuid, nativeWindow);
  }

  return nativeWindow;
}
