import { APIHandlerMap, APIMessage, Identity } from '../../../shapes';
import { getTargetExternalWindowIdentity, registerActionMap } from './api_protocol_base.js';
import * as ExternalWindow from '../../api/external_window';

export const ExternalWindowApiMap: APIHandlerMap = {
  'animate-external-window': animateExternalWindow,
  'bring-external-window-to-front': bringExternalWindowToFront,
  'close-external-window': closeExternalWindow,
  'disable-external-window-frame': disableExternalWindowFrame,
  'enable-externa-window-frame': enableExternaWindowFrame,
  'flash-external-window': flashExternalWindow,
  'focus-external-window': focusExternalWindow,
  'get-external-window-bounds': getExternalWindowBounds,
  'get-external-window-group': getExternalWindowGroup,
  'get-external-window-options': getExternalWindowOptions,
  'get-external-window-state': getExternalWindowState,
  'hide-external-window': hideExternalWindow,
  'is-external-window-showing': isExternalWindowShowing,
  'join-external-window-group': joinExternalWindowGroup,
  'leave-external-window-group': leaveExternalWindowGroup,
  'maximize-external-window': maximizeExternalWindow,
  'merge-external-window-groups': mergeExternalWindowGroups,
  'minimize-external-window': minimizeExternalWindow,
  'move-external-window-by': moveExternalWindowBy,
  'move-external-window': moveExternalWindow,
  'resize-external-window-by': resizeExternalWindowBy,
  'resize-external-window': resizeExternalWindow,
  'restore-external-window': restoreExternalWindow,
  'set-foreground-external-window': setForegroundExternalWindow,
  'set-external-window-bounds': setExternalWindowBounds,
  'show-external-window': showExternalWindow,
  'show-at-external-window': showAtExternalWindow,
  'stop-flash-external-window': stopFlashExternalWindow,
}

export function init(): void {
  registerActionMap(ExternalWindowApiMap);
}

async function animateExternalWindow(identity: Identity, message: APIMessage) {
  const { payload } = message;
  return await ExternalWindow.animateExternalWindow();
}

async function bringExternalWindowToFront(identity: Identity, message: APIMessage) {
  const { payload } = message;
  return await ExternalWindow.bringExternalWindowToFront();
}

async function closeExternalWindow(identity: Identity, message: APIMessage) {
  const { payload } = message;
  return await ExternalWindow.closeExternalWindow();
}

async function disableExternalWindowFrame(identity: Identity, message: APIMessage) {
  const { payload } = message;
  return await ExternalWindow.disableExternalWindowFrame();
}

async function enableExternaWindowFrame(identity: Identity, message: APIMessage) {
  const { payload } = message;
  return await ExternalWindow.enableExternaWindowFrame();
}

async function flashExternalWindow(identity: Identity, message: APIMessage) {
  const { payload } = message;
  return await ExternalWindow.flashExternalWindow();
}

async function focusExternalWindow(identity: Identity, message: APIMessage) {
  const { payload } = message;
  return await ExternalWindow.focusExternalWindow();
}

async function getExternalWindowBounds(identity: Identity, message: APIMessage) {
  const { payload } = message;
  return await ExternalWindow.getExternalWindowBounds();
}

async function getExternalWindowGroup(identity: Identity, message: APIMessage) {
  const { payload } = message;
  return await ExternalWindow.getExternalWindowGroup();
}

async function getExternalWindowOptions(identity: Identity, message: APIMessage) {
  const { payload } = message;
  return await ExternalWindow.getExternalWindowOptions();
}

async function getExternalWindowState(identity: Identity, message: APIMessage) {
  const { payload } = message;
  return await ExternalWindow.getExternalWindowState();
}

async function hideExternalWindow(identity: Identity, message: APIMessage) {
  const { payload } = message;
  return await ExternalWindow.hideExternalWindow();
}

async function isExternalWindowShowing(identity: Identity, message: APIMessage) {
  const { payload } = message;
  return await ExternalWindow.isExternalWindowShowing();
}

async function joinExternalWindowGroup(identity: Identity, message: APIMessage) {
  const { payload } = message;
  return await ExternalWindow.joinExternalWindowGroup();
}

async function leaveExternalWindowGroup(identity: Identity, message: APIMessage) {
  const { payload } = message;
  return await ExternalWindow.leaveExternalWindowGroup();
}

async function maximizeExternalWindow(identity: Identity, message: APIMessage) {
  const { payload } = message;
  return await ExternalWindow.maximizeExternalWindow();
}

async function mergeExternalWindowGroups(identity: Identity, message: APIMessage) {
  const { payload } = message;
  return await ExternalWindow.mergeExternalWindowGroups();
}

async function minimizeExternalWindow(identity: Identity, message: APIMessage) {
  const { payload } = message;
  const targetIdentity = getTargetExternalWindowIdentity(payload);
  return await ExternalWindow.minimizeExternalWindow(targetIdentity);
}

async function moveExternalWindowBy(identity: Identity, message: APIMessage) {
  const { payload } = message;
  const { deltaLeft, deltaTop } = payload;
  const targetIdentity = getTargetExternalWindowIdentity(payload);
  return await ExternalWindow.moveExternalWindowBy(targetIdentity, { deltaLeft, deltaTop });
}

async function moveExternalWindow(identity: Identity, message: APIMessage) {
  const { payload } = message;
  const { left, top } = payload;
  const targetIdentity = getTargetExternalWindowIdentity(payload);
  return await ExternalWindow.moveExternalWindow(targetIdentity, { left, top });
}

async function resizeExternalWindowBy(identity: Identity, message: APIMessage) {
  const { payload } = message;
  return await ExternalWindow.resizeExternalWindowBy();
}

async function resizeExternalWindow(identity: Identity, message: APIMessage) {
  const { payload } = message;
  return await ExternalWindow.resizeExternalWindow();
}

async function restoreExternalWindow(identity: Identity, message: APIMessage) {
  const { payload } = message;
  return await ExternalWindow.restoreExternalWindow();
}

async function setForegroundExternalWindow(identity: Identity, message: APIMessage) {
  const { payload } = message;
  return await ExternalWindow.setForegroundExternalWindow();
}

async function setExternalWindowBounds(identity: Identity, message: APIMessage) {
  const { payload } = message;
  return await ExternalWindow.setExternalWindowBounds();
}

async function showExternalWindow(identity: Identity, message: APIMessage) {
  const { payload } = message;
  return await ExternalWindow.showExternalWindow();
}

async function showAtExternalWindow(identity: Identity, message: APIMessage) {
  const { payload } = message;
  return await ExternalWindow.showAtExternalWindow();
}

async function stopFlashExternalWindow(identity: Identity, message: APIMessage) {
  const { payload } = message;
  return await ExternalWindow.stopFlashExternalWindow();
}
