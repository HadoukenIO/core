import { APIHandlerMap, APIMessage, Identity } from '../../../shapes';
import { argo } from '../../core_state';
import { getTargetExternalWindowIdentity, registerActionMap, getGroupingWindowIdentity } from './api_protocol_base.js';
import { hijackMovesForGroupedWindows } from './grouped_window_moves';
import * as ExternalWindow from '../../api/external_window';

export const ExternalWindowApiMap: APIHandlerMap = {
  'bring-external-window-to-front': bringExternalWindowToFront,
  'close-external-window': closeExternalWindow,
  'disable-external-window-user-movement': disableExternalWindowUserMovement,
  'enable-external-window-user-movement': enableExternaWindowUserMovement,
  'flash-external-window': flashExternalWindow,
  'focus-external-window': focusExternalWindow,
  'get-external-window-bounds': getExternalWindowBounds,
  'get-external-window-group': getExternalWindowGroup,
  'get-external-window-info': getExternalWindowInfo,
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
  'register-native-external-window': {
    apiFunc: registerNativeExternalWindow,
    apiPath: '.wrap',
    defaultPermission: false
  },
  'resize-external-window-by': resizeExternalWindowBy,
  'resize-external-window': resizeExternalWindowTo,
  'restore-external-window': restoreExternalWindow,
  'set-external-window-as-foreground': setExternalWindowAsForeground,
  'set-external-window-bounds': setExternalWindowBounds,
  'show-external-window-at': showExternalWindowAt,
  'show-external-window': showExternalWindow,
  'stop-external-window-flashing': stopExternalWindowFlashing,
  'update-external-window-options': updateExternalWindowOptions
};

export function init(): void {
  const registrationMap = argo['use-legacy-window-groups']
    ? ExternalWindowApiMap
    : hijackMovesForGroupedWindows(ExternalWindowApiMap);

  registerActionMap(registrationMap, 'ExternalWindow');
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

async function disableExternalWindowUserMovement(identity: Identity, message: APIMessage) {
  const { payload } = message;
  const targetIdentity = getTargetExternalWindowIdentity(payload);
  return ExternalWindow.disableExternalWindowUserMovement(targetIdentity, identity);
}

async function enableExternaWindowUserMovement(identity: Identity, message: APIMessage) {
  const { payload } = message;
  const targetIdentity = getTargetExternalWindowIdentity(payload);
  return ExternalWindow.enableExternaWindowUserMovement(targetIdentity);
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

async function getExternalWindowInfo(identity: Identity, message: APIMessage) {
  const { payload } = message;
  const targetIdentity = getTargetExternalWindowIdentity(payload);
  return ExternalWindow.getExternalWindowInfo(targetIdentity);
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

async function joinExternalWindowGroup(identity: Identity, message: APIMessage, ack: any, nack: any) {
  // nack if joining an ExternalWindow since certain methods don't work without injection
  nack(new Error('Joining a group with an ExternalWindow is not supported'));
  return;
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
  const groupingIdentity = getGroupingWindowIdentity(payload);
  return ExternalWindow.mergeExternalWindowGroups(targetIdentity, groupingIdentity);
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

async function registerNativeExternalWindow(identity: Identity, message: APIMessage) {
  const { payload } = message;
  const targetIdentity = getTargetExternalWindowIdentity(payload);
  return ExternalWindow.registerNativeExternalWindow(targetIdentity);
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

async function showExternalWindowAt(identity: Identity, message: APIMessage) {
  const { payload } = message;
  const { left, top } = payload;
  const targetIdentity = getTargetExternalWindowIdentity(payload);
  return ExternalWindow.showExternalWindowAt(targetIdentity, { left, top });
}

async function showExternalWindow(identity: Identity, message: APIMessage) {
  const { payload } = message;
  const targetIdentity = getTargetExternalWindowIdentity(payload);
  return ExternalWindow.showExternalWindow(targetIdentity);
}

async function stopExternalWindowFlashing(identity: Identity, message: APIMessage) {
  const { payload } = message;
  const targetIdentity = getTargetExternalWindowIdentity(payload);
  return ExternalWindow.stopExternalWindowFlashing(targetIdentity);
}

async function updateExternalWindowOptions(identity: Identity, message: APIMessage) {
  const { payload } = message;
  const { options } = payload;
  const targetIdentity = getTargetExternalWindowIdentity(payload);
  return ExternalWindow.updateExternalWindowOptions(targetIdentity, options);
}
