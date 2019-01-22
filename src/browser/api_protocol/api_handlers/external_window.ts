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
  'resize-external-window': resizeExternalWindowTo,
  'restore-external-window': restoreExternalWindow,
  'set-foreground-external-window': setExternalWindowAsForeground,
  'set-external-window-bounds': setExternalWindowBounds,
  'show-external-window': showExternalWindow,
  'show-at-external-window': showExternalWindowAt,
  'stop-flash-external-window': stopFlashExternalWindow,
}

export function init(): void {
  registerActionMap(ExternalWindowApiMap);
}

async function animateExternalWindow(identity: Identity, message: APIMessage) {
  const { payload } = message;
  const targetIdentity = getTargetExternalWindowIdentity(payload);
  return ExternalWindow.animateExternalWindow(targetIdentity);
}

async function bringExternalWindowToFront(identity: Identity, message: APIMessage) {
  const { payload } = message;
  const targetIdentity = getTargetExternalWindowIdentity(payload);
  return ExternalWindow.bringExternalWindowToFront(targetIdentity);
}

async function closeExternalWindow(identity: Identity, message: APIMessage) {
  const { payload } = message;
  const targetIdentity = getTargetExternalWindowIdentity(payload);
  return ExternalWindow.closeExternalWindow(targetIdentity);
}

async function disableExternalWindowFrame(identity: Identity, message: APIMessage) {
  const { payload } = message;
  const targetIdentity = getTargetExternalWindowIdentity(payload);
  return ExternalWindow.disableExternalWindowFrame(targetIdentity);
}

async function enableExternaWindowFrame(identity: Identity, message: APIMessage) {
  const { payload } = message;
  const targetIdentity = getTargetExternalWindowIdentity(payload);
  return ExternalWindow.enableExternaWindowFrame(targetIdentity);
}

async function flashExternalWindow(identity: Identity, message: APIMessage) {
  const { payload } = message;
  const targetIdentity = getTargetExternalWindowIdentity(payload);
  return ExternalWindow.flashExternalWindow(targetIdentity);
}

async function focusExternalWindow(identity: Identity, message: APIMessage) {
  const { payload } = message;
  const targetIdentity = getTargetExternalWindowIdentity(payload);
  return ExternalWindow.focusExternalWindow(targetIdentity);
}

async function getExternalWindowBounds(identity: Identity, message: APIMessage) {
  const { payload } = message;
  const targetIdentity = getTargetExternalWindowIdentity(payload);
  return ExternalWindow.getExternalWindowBounds(targetIdentity);
}

async function getExternalWindowGroup(identity: Identity, message: APIMessage) {
  const { payload } = message;
  const targetIdentity = getTargetExternalWindowIdentity(payload);
  return ExternalWindow.getExternalWindowGroup(targetIdentity);
}

async function getExternalWindowOptions(identity: Identity, message: APIMessage) {
  const { payload } = message;
  const targetIdentity = getTargetExternalWindowIdentity(payload);
  return ExternalWindow.getExternalWindowOptions(targetIdentity);
}

async function getExternalWindowState(identity: Identity, message: APIMessage) {
  const { payload } = message;
  const targetIdentity = getTargetExternalWindowIdentity(payload);
  return ExternalWindow.getExternalWindowState(targetIdentity);
}

async function hideExternalWindow(identity: Identity, message: APIMessage) {
  const { payload } = message;
  const targetIdentity = getTargetExternalWindowIdentity(payload);
  return ExternalWindow.hideExternalWindow(targetIdentity);
}

async function isExternalWindowShowing(identity: Identity, message: APIMessage) {
  const { payload } = message;
  const targetIdentity = getTargetExternalWindowIdentity(payload);
  return ExternalWindow.isExternalWindowShowing(targetIdentity);
}

async function joinExternalWindowGroup(identity: Identity, message: APIMessage) {
  const { payload } = message;
  const targetIdentity = getTargetExternalWindowIdentity(payload);
  return ExternalWindow.joinExternalWindowGroup(targetIdentity);
}

async function leaveExternalWindowGroup(identity: Identity, message: APIMessage) {
  const { payload } = message;
  const targetIdentity = getTargetExternalWindowIdentity(payload);
  return ExternalWindow.leaveExternalWindowGroup(targetIdentity);
}

async function maximizeExternalWindow(identity: Identity, message: APIMessage) {
  const { payload } = message;
  const targetIdentity = getTargetExternalWindowIdentity(payload);
  return ExternalWindow.maximizeExternalWindow(targetIdentity);
}

async function mergeExternalWindowGroups(identity: Identity, message: APIMessage) {
  const { payload } = message;
  const targetIdentity = getTargetExternalWindowIdentity(payload);
  return ExternalWindow.mergeExternalWindowGroups(targetIdentity);
}

async function minimizeExternalWindow(identity: Identity, message: APIMessage) {
  const { payload } = message;
  const targetIdentity = getTargetExternalWindowIdentity(payload);
  return ExternalWindow.minimizeExternalWindow(targetIdentity);
}

async function moveExternalWindowBy(identity: Identity, message: APIMessage) {
  const { payload } = message;
  const { deltaLeft, deltaTop } = payload;
  const targetIdentity = getTargetExternalWindowIdentity(payload);
  return ExternalWindow.moveExternalWindowBy(targetIdentity, { deltaLeft, deltaTop });
}

async function moveExternalWindow(identity: Identity, message: APIMessage) {
  const { payload } = message;
  const { left, top } = payload;
  const targetIdentity = getTargetExternalWindowIdentity(payload);
  return ExternalWindow.moveExternalWindow(targetIdentity, { left, top });
}

async function resizeExternalWindowBy(identity: Identity, message: APIMessage) {
  const { payload } = message;
  const { anchor, deltaHeight, deltaWidth } = payload;
  const targetIdentity = getTargetExternalWindowIdentity(payload);
  return ExternalWindow.resizeExternalWindowBy(targetIdentity, { anchor, deltaHeight, deltaWidth });
}

async function resizeExternalWindowTo(identity: Identity, message: APIMessage) {
  const { payload } = message;
  const { anchor, height, width } = payload;
  const targetIdentity = getTargetExternalWindowIdentity(payload);
  return ExternalWindow.resizeExternalWindowTo(targetIdentity, { anchor, height, width });
}

async function restoreExternalWindow(identity: Identity, message: APIMessage) {
  const { payload } = message;
  const targetIdentity = getTargetExternalWindowIdentity(payload);
  return ExternalWindow.restoreExternalWindow(targetIdentity);
}

async function setExternalWindowAsForeground(identity: Identity, message: APIMessage) {
  const { payload } = message;
  const targetIdentity = getTargetExternalWindowIdentity(payload);
  return ExternalWindow.setExternalWindowAsForeground(targetIdentity);
}

async function setExternalWindowBounds(identity: Identity, message: APIMessage) {
  const { payload } = message;
  const { height, left, top, width } = payload;
  const targetIdentity = getTargetExternalWindowIdentity(payload);
  return ExternalWindow.setExternalWindowBounds(targetIdentity, { height, left, top, width });
}

async function showExternalWindow(identity: Identity, message: APIMessage) {
  const { payload } = message;
  const targetIdentity = getTargetExternalWindowIdentity(payload);
  return ExternalWindow.showExternalWindow(targetIdentity);
}

async function showExternalWindowAt(identity: Identity, message: APIMessage) {
  const { payload } = message;
  const { left, top } = payload;
  const targetIdentity = getTargetExternalWindowIdentity(payload);
  return ExternalWindow.showExternalWindowAt(targetIdentity, { left, top });
}

async function stopFlashExternalWindow(identity: Identity, message: APIMessage) {
  const { payload } = message;
  const targetIdentity = getTargetExternalWindowIdentity(payload);
  return ExternalWindow.stopFlashExternalWindow(targetIdentity);
}
