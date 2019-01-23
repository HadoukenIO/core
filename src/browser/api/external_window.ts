import { Bounds } from '../../../js-adapter/src/shapes';
import { app as electronApp, BrowserWindow } from 'electron';
import { ExternalWindowIdentity } from '../../../js-adapter/src/identity';
import * as NativeWindowModule from './native_window';
import * as Shapes from '../../shapes';
import ofEvents from '../of_events';
import route from '../../common/route';

const registeredExternalWindows = new Map<string, BrowserWindow>();

export function addEventListener(identity: Shapes.Identity, type: string, listener: Shapes.Listener) {
  const evt = route.externalWindow(type, identity.uuid);
  ofEvents.on(evt, listener);
  return () => ofEvents.removeListener(evt, listener);
}

export function animateExternalWindow(identity: ExternalWindowIdentity) {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.noop(nativeWindow);
}

export function bringExternalWindowToFront(identity: ExternalWindowIdentity) {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.bringToFront(nativeWindow);
}

export function closeExternalWindow(identity: ExternalWindowIdentity) {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.close(nativeWindow);
}

export function disableExternalWindowFrame(identity: ExternalWindowIdentity) {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.noop(nativeWindow);
}

export function enableExternaWindowFrame(identity: ExternalWindowIdentity) {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.noop(nativeWindow);
}

export function flashExternalWindow(identity: ExternalWindowIdentity) {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.flash(nativeWindow);
}

export function focusExternalWindow(identity: ExternalWindowIdentity) {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.focus(nativeWindow);
}

export function getExternalWindowBounds(identity: ExternalWindowIdentity) {
  const nativeWindow = getNativeWindow(identity);
  return NativeWindowModule.getBounds(nativeWindow);
}

export function getExternalWindowGroup(identity: ExternalWindowIdentity) {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.noop(nativeWindow);
}

export function getExternalWindowOptions(identity: ExternalWindowIdentity): Shapes.NativeWindowInfo {
  const { nativeId } = identity;
  return electronApp.getNativeWindowInfoForNativeId(nativeId);;
}

export function getExternalWindowState(identity: ExternalWindowIdentity) {
  const nativeWindow = getNativeWindow(identity);
  return NativeWindowModule.getState(nativeWindow);
}

export function hideExternalWindow(identity: ExternalWindowIdentity) {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.hide(nativeWindow);
}

export function isExternalWindowShowing(identity: ExternalWindowIdentity) {
  const nativeWindow = getNativeWindow(identity);
  return NativeWindowModule.isVisible(nativeWindow);
}

export function joinExternalWindowGroup(identity: ExternalWindowIdentity) {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.noop(nativeWindow);
}

export function leaveExternalWindowGroup(identity: ExternalWindowIdentity) {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.noop(nativeWindow);
}

export function maximizeExternalWindow(identity: ExternalWindowIdentity) {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.maximize(nativeWindow);
}

export function mergeExternalWindowGroups(identity: ExternalWindowIdentity) {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.noop(nativeWindow);
}

export function minimizeExternalWindow(identity: ExternalWindowIdentity) {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.minimize(nativeWindow);
}

export function moveExternalWindowBy(identity: ExternalWindowIdentity, payload: Shapes.MoveWindowByOpts) {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.moveBy(nativeWindow, payload);
}

export function moveExternalWindow(identity: ExternalWindowIdentity, payload: Shapes.MoveWindowToOpts) {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.moveTo(nativeWindow, payload);
}

export function resizeExternalWindowBy(identity: ExternalWindowIdentity, payload: Shapes.ResizeWindowByOpts) {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.resizeBy(nativeWindow, payload);
}

export function resizeExternalWindowTo(identity: ExternalWindowIdentity, payload: Shapes.ResizeWindowToOpts) {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.resizeTo(nativeWindow, payload);
}

export function restoreExternalWindow(identity: ExternalWindowIdentity) {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.restore(nativeWindow);
}

export function setExternalWindowAsForeground(identity: ExternalWindowIdentity) {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.setAsForeground(nativeWindow);
}

export function setExternalWindowBounds(identity: ExternalWindowIdentity, payload: Bounds) {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.setBounds(nativeWindow, payload);
}

export function showExternalWindow(identity: ExternalWindowIdentity) {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.show(nativeWindow);
}

export function showExternalWindowAt(identity: ExternalWindowIdentity, payload: Shapes.ShowWindowAtOpts) {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.showAt(nativeWindow, payload);
}

export function stopExternalWindowFlashing(identity: ExternalWindowIdentity) {
  const nativeWindow = getNativeWindow(identity);
  NativeWindowModule.stopFlashing(nativeWindow);
}

function getNativeWindow(identity: ExternalWindowIdentity) {
  const { nativeId } = identity;
  let nativeWindow = registeredExternalWindows.get(nativeId);

  if (!nativeWindow) {
    nativeWindow = new BrowserWindow({ hwnd: nativeId });
    // TODO: add nativeWindow destruction
    registeredExternalWindows.set(nativeId, nativeWindow);
  }

  return nativeWindow;
}
