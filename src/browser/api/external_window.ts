import { Identity, Listener } from '../../shapes';
import ofEvents from '../of_events';
import route from '../../common/route';

export function addEventListener(identity: Identity, type: string, listener: Listener) {
  const evt = route.externalWindow(type, identity.uuid);
  ofEvents.on(evt, listener);
  return () => ofEvents.removeListener(evt, listener);
}

export async function animateExternalWindow(): Promise<void> {

}

export async function bringExternalWindowToFront(): Promise<void> {

}

export async function closeExternalWindow(): Promise<void> {

}

export async function disableExternalWindowFrame(): Promise<void> {

}

export async function enableExternaWindowFrame(): Promise<void> {

}

export async function flashExternalWindow(): Promise<void> {

}

export async function focusExternalWindow(): Promise<void> {

}

export async function getExternalWindowBounds(): Promise<void> {

}

export async function getExternalWindowGroup(): Promise<void> {

}

export async function getExternalWindowOptions(): Promise<void> {

}

export async function getExternalWindowState(): Promise<void> {

}

export async function hideExternalWindow(): Promise<void> {

}

export async function isExternalWindowShowing(): Promise<void> {

}

export async function joinExternalWindowGroup(): Promise<void> {

}

export async function leaveExternalWindowGroup(): Promise<void> {

}

export async function maximizeExternalWindow(): Promise<void> {

}

export async function mergeExternalWindowGroups(): Promise<void> {

}

export async function minimizeExternalWindow(): Promise<void> {

}

export async function moveExternalWindowBy(): Promise<void> {
  
}

export async function moveExternalWindow(): Promise<void> {

}

export async function resizeExternalWindowBy(): Promise<void> {
  
}

export async function resizeExternalWindow(): Promise<void> {

}

export async function restoreExternalWindow(): Promise<void> {

}

export async function setForegroundExternalWindow(): Promise<void> {

}

export async function setExternalWindowBounds(): Promise<void> {

}

export async function showExternalWindow(): Promise<void> {

}

export async function showAtExternalWindow(): Promise<void> {

}

export async function stopFlashExternalWindow(): Promise<void> {

}
