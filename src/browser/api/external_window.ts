import { BrowserWindow } from 'electron';
import { ExternalWindowIdentity } from '../../../js-adapter/src/identity';
import * as Shapes from '../../shapes';
import * as NativeWindow from './native_window';
import ofEvents from '../of_events';
import route from '../../common/route';

const registeredExternalWindows = new Map<string, BrowserWindow>();

export function addEventListener(identity: Shapes.Identity, type: string, listener: Shapes.Listener) {
  const evt = route.externalWindow(type, identity.uuid);
  ofEvents.on(evt, listener);
  return () => ofEvents.removeListener(evt, listener);
}

export async function animateExternalWindow(identity: ExternalWindowIdentity, payload: any): Promise<void> {
  const externalWindow = getExternalWindow(identity);
  NativeWindow.noop(externalWindow);
}

export async function bringExternalWindowToFront(identity: ExternalWindowIdentity, payload: any): Promise<void> {
  const externalWindow = getExternalWindow(identity);
  NativeWindow.noop(externalWindow);
}

export async function closeExternalWindow(identity: ExternalWindowIdentity, payload: any): Promise<void> {
  const externalWindow = getExternalWindow(identity);
  NativeWindow.noop(externalWindow);
}

export async function disableExternalWindowFrame(identity: ExternalWindowIdentity, payload: any): Promise<void> {
  const externalWindow = getExternalWindow(identity);
  NativeWindow.noop(externalWindow);
}

export async function enableExternaWindowFrame(identity: ExternalWindowIdentity, payload: any): Promise<void> {
  const externalWindow = getExternalWindow(identity);
  NativeWindow.noop(externalWindow);
}

export async function flashExternalWindow(identity: ExternalWindowIdentity, payload: any): Promise<void> {
  const externalWindow = getExternalWindow(identity);
  NativeWindow.noop(externalWindow);
}

export async function focusExternalWindow(identity: ExternalWindowIdentity, payload: any): Promise<void> {
  const externalWindow = getExternalWindow(identity);
  NativeWindow.noop(externalWindow);
}

export async function getExternalWindowBounds(identity: ExternalWindowIdentity, payload: any): Promise<void> {
  const externalWindow = getExternalWindow(identity);
  NativeWindow.noop(externalWindow);
}

export async function getExternalWindowGroup(identity: ExternalWindowIdentity, payload: any): Promise<void> {
  const externalWindow = getExternalWindow(identity);
  NativeWindow.noop(externalWindow);
}

export async function getExternalWindowOptions(identity: ExternalWindowIdentity, payload: any): Promise<void> {
  const externalWindow = getExternalWindow(identity);
  NativeWindow.noop(externalWindow);
}

export async function getExternalWindowState(identity: ExternalWindowIdentity, payload: any): Promise<void> {
  const externalWindow = getExternalWindow(identity);
  NativeWindow.noop(externalWindow);
}

export async function hideExternalWindow(identity: ExternalWindowIdentity, payload: any): Promise<void> {
  const externalWindow = getExternalWindow(identity);
  NativeWindow.noop(externalWindow);
}

export async function isExternalWindowShowing(identity: ExternalWindowIdentity, payload: any): Promise<void> {
  const externalWindow = getExternalWindow(identity);
  NativeWindow.noop(externalWindow);
}

export async function joinExternalWindowGroup(identity: ExternalWindowIdentity, payload: any): Promise<void> {
  const externalWindow = getExternalWindow(identity);
  NativeWindow.noop(externalWindow);
}

export async function leaveExternalWindowGroup(identity: ExternalWindowIdentity, payload: any): Promise<void> {
  const externalWindow = getExternalWindow(identity);
  NativeWindow.noop(externalWindow);
}

export async function maximizeExternalWindow(identity: ExternalWindowIdentity, payload: any): Promise<void> {
  const externalWindow = getExternalWindow(identity);
  NativeWindow.noop(externalWindow);
}

export async function mergeExternalWindowGroups(identity: ExternalWindowIdentity, payload: any): Promise<void> {
  const externalWindow = getExternalWindow(identity);
  NativeWindow.noop(externalWindow);
}

export async function minimizeExternalWindow(identity: ExternalWindowIdentity): Promise<void> {
  const externalWindow = getExternalWindow(identity);
  NativeWindow.minimize(externalWindow);
}

export async function moveExternalWindowBy(identity: ExternalWindowIdentity, payload: Shapes.MoveWindowByOpts): Promise<void> {
  const externalWindow = getExternalWindow(identity);
  NativeWindow.moveBy(externalWindow, payload);
}

export async function moveExternalWindow(identity: ExternalWindowIdentity, payload: Shapes.MoveWindowToOpts): Promise<void> {
  const externalWindow = getExternalWindow(identity);
  NativeWindow.moveTo(externalWindow, payload);
}

export async function resizeExternalWindowBy(identity: ExternalWindowIdentity, payload: any): Promise<void> {
  const externalWindow = getExternalWindow(identity);
  NativeWindow.noop(externalWindow);
}

export async function resizeExternalWindow(identity: ExternalWindowIdentity, payload: any): Promise<void> {
  const externalWindow = getExternalWindow(identity);
  NativeWindow.noop(externalWindow);
}

export async function restoreExternalWindow(identity: ExternalWindowIdentity, payload: any): Promise<void> {
  const externalWindow = getExternalWindow(identity);
  NativeWindow.noop(externalWindow);
}

export async function setForegroundExternalWindow(identity: ExternalWindowIdentity, payload: any): Promise<void> {
  const externalWindow = getExternalWindow(identity);
  NativeWindow.noop(externalWindow);
}

export async function setExternalWindowBounds(identity: ExternalWindowIdentity, payload: any): Promise<void> {
  const externalWindow = getExternalWindow(identity);
  NativeWindow.noop(externalWindow);
}

export async function showExternalWindow(identity: ExternalWindowIdentity, payload: any): Promise<void> {
  const externalWindow = getExternalWindow(identity);
  NativeWindow.noop(externalWindow);
}

export async function showAtExternalWindow(identity: ExternalWindowIdentity, payload: any): Promise<void> {
  const externalWindow = getExternalWindow(identity);
  NativeWindow.noop(externalWindow);
}

export async function stopFlashExternalWindow(identity: ExternalWindowIdentity, payload: any): Promise<void> {
  const externalWindow = getExternalWindow(identity);
  NativeWindow.noop(externalWindow);
}

function getExternalWindow(identity: ExternalWindowIdentity) {
  const { nativeId } = identity;
  let externalWindow = registeredExternalWindows.get(nativeId);

  if (!externalWindow) {
    externalWindow = new BrowserWindow({ hwnd: nativeId });
    // TODO: add externalWindow destruction
    registeredExternalWindows.set(nativeId, externalWindow);
  }

  return externalWindow;
}
