import { app as electronApp, ExternalWindow, WinEventHookEmitter, NativeWindowInfo } from 'electron';
import { Bounds } from '../../../js-adapter/src/shapes';
import { EventEmitter } from 'events';
import { getNativeWindowInfo, getNativeWindowInfoLite } from '../utils';
import { Identity } from '../../../js-adapter/src/identity';
import { OF_EVENT_FROM_WINDOWS_MESSAGE } from '../../common/windows_messages';
import * as NativeWindowModule from './native_window';
import * as Shapes from '../../shapes';
import ExternalWindowEventAdapter from '../external_window_event_adapter';
import InjectionBus from '../transports/injection_bus';
import ofEvents from '../of_events';
import route from '../../common/route';
import WindowGroups, { GroupChangedEvent, GroupEvent } from '../window_groups';
import ProcessTracker from '../process_tracker';
import SubscriptionManager from '../subscription_manager';

electronApp.on('ready', () => {
  subToGlobalWinEventHooks();
});

const subscriptionManager = new SubscriptionManager();

// Maps
export const externalWindows = new Map<string, Shapes.ExternalWindow>();
const disabledUserMovementRequestorCount = new Map<string, number>();
const externalWindowEventAdapters = new Map<string, ExternalWindowEventAdapter>();
const injectionBuses = new Map<string, InjectionBus>();
const windowGroupUnSubscriptions = new Map<string, () => void>();
const winEventHooksEmitters = new Map<string, WinEventHookEmitter>();

export async function addEventListener(identity: Identity, eventName: string, listener: Shapes.Listener): Promise<() => void> {
  const externalWindow = getExternalWindow(identity);
  externalWindow.on(eventName, listener);
  return () => externalWindow.removeListener(eventName, listener);
}

export function bringExternalWindowToFront(identity: Identity): void {
  const externalWindow = getExternalWindow(identity);
  NativeWindowModule.setAsForeground(externalWindow);
}

export function closeExternalWindow(identity: Identity): void {
  const externalWindow = getExternalWindow(identity);
  externalWindowCloseCleanup(externalWindow);
  externalWindow.forceExternalWindowClose();
}

export async function disableExternalWindowUserMovement(target: Identity, requestor?: Identity): Promise<void> {
  const externalWindow = getExternalWindow(target);
  const injectionBus = getInjectionBus(externalWindow);
  await injectionBus.set({ userMovement: false });
  externalWindow.emit('user-movement-disabled');

  // Register a subscription that will fire every time requesting identity closes
  // and if all requestors for disabling frame are gone - enable the frame.
  if (requestor) {
    const key = getKey(externalWindow);
    const subscriptionKey = `disable-external-window-user-movement-${key}`;
    const onRequestorClose = async () => {
      let requestorCount = disabledUserMovementRequestorCount.get(key) || 0;
      if (requestorCount > 1) {
        disabledUserMovementRequestorCount.set(key, --requestorCount);
      } else {
        await enableExternaWindowUserMovement(target);
      }
    };
    let requestorCount = disabledUserMovementRequestorCount.get(key) || 0;
    disabledUserMovementRequestorCount.set(key, ++requestorCount);
    subscriptionManager.registerSubscription(onRequestorClose, requestor, subscriptionKey);
  }
}

export async function enableExternaWindowUserMovement(identity: Identity): Promise<void> {
  const externalWindow = getExternalWindow(identity);
  const injectionBus = getInjectionBus(externalWindow);
  await injectionBus.set({ userMovement: true });
  externalWindow.emit('user-movement-enabled');

  // Decrement count of the requesting identities that previously disabled
  // frame of an external window.
  const key = getKey(externalWindow);
  if (disabledUserMovementRequestorCount.has(key)) {
    let requestorCount = disabledUserMovementRequestorCount.get(key);
    disabledUserMovementRequestorCount.set(key, --requestorCount);
  }
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
  return getNativeWindowInfo(rawNativeWindowInfo);
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

export function registerNativeExternalWindow(identity: Identity): Shapes.NativeWindowIdentity {
  const { uuid, name, nativeId } = getExternalWindow(identity);
  return { uuid, name, nativeId };
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
  Returns a key for maps
*/
function getKey(externalWindow: Shapes.ExternalWindow): string {
  const { uuid } = externalWindow;
  return uuid;
}

/*
  Returns registerd external window
*/
export function getRegisteredExternalWindow(identity: Identity): Shapes.ExternalWindow | undefined {
  const { uuid } = identity;
  return externalWindows.get(uuid);
}

/*
  Checks whether a uuid is a valid target for wrapping
*/
function findExistingNativeWindow(identity: Shapes.NativeWindowIdentity): Shapes.NativeWindowInfoLite|undefined {
  const { uuid, nativeId } = identity;
  const allNativeWindows = electronApp.getAllNativeWindowInfo(true);
  // Check whether we are using a uuid generated by `launchExternalProcess`
  const prelaunchedProcess = ProcessTracker.getProcessByUuid(uuid);
  const win = prelaunchedProcess
    ? allNativeWindows.find(win => win.process.pid === prelaunchedProcess.process.id)
    : allNativeWindows.find(win => {
      const liteInfo = getNativeWindowInfoLite(win);
      return liteInfo.uuid === uuid || liteInfo.nativeId === nativeId;
    });

  if (!win) {
    return;
  }

  const liteInfo = getNativeWindowInfoLite(win);
  if (prelaunchedProcess) {
    // Respect original uuid if present
    liteInfo.uuid = prelaunchedProcess.uuid;
  }
  return liteInfo;
}

/*
  Returns a registered native window or creates a new one if not found.
*/
export function getExternalWindow(identity: Shapes.NativeWindowIdentity): Shapes.ExternalWindow {
  const { uuid } = identity;
  let externalWindow = externalWindows.get(uuid);

  if (!externalWindow) {
    const nativeWinObj = findExistingNativeWindow(identity);

    if (!nativeWinObj) {
      throw new Error(`Attempted to interact with a nonexistent external window using identity ${JSON.stringify(identity)}}`);
    }
    externalWindow = <Shapes.ExternalWindow>(new ExternalWindow({ hwnd: nativeWinObj.nativeId }));

    setAdditionalProperties(externalWindow, identity);
    subscribeToInjectionEvents(externalWindow);
    subscribeToWinEventHooks(externalWindow);
    subscribeToWindowGroupEvents(externalWindow);

    externalWindows.set(uuid, externalWindow);
  }

  return externalWindow;
}

/*
  Gets (creates when missing) injection bus for specified external window
*/
function getInjectionBus(externalWindow: Shapes.ExternalWindow): InjectionBus {
  const key = getKey(externalWindow);
  let injectionBus = injectionBuses.get(key);

  if (!injectionBus) {
    const { nativeId } = externalWindow;
    const pid = electronApp.getProcessIdForNativeId(nativeId);
    const externalWindowEventAdapter = new ExternalWindowEventAdapter(externalWindow);
    injectionBus = new InjectionBus({ nativeId, pid });

    injectionBuses.set(key, injectionBus);
    externalWindowEventAdapters.set(key, externalWindowEventAdapter);
  }

  return injectionBus;
}

/*
  Emit "bounds-changed" event for a specific external window, if bounds changed.
*/
function emitBoundsChangedEvent(identity: Identity, previousNativeWindowInfo: Shapes.NativeWindowInfo): void {
  const externalWindow = getExternalWindow(identity);
  const currentWindowInfo = getExternalWindowInfo(identity);
  const curBounds = currentWindowInfo.bounds;
  const prevBounds = previousNativeWindowInfo.bounds;
  const boundsChanged =
    prevBounds.height !== curBounds.height ||
    prevBounds.width !== curBounds.width ||
    prevBounds.x !== curBounds.x ||
    prevBounds.y !== curBounds.y;

  if (boundsChanged) {
    externalWindow.once('bounds-changing', () => {
      const {
        changeType, deferred, height, left, reason, top, width
      } = getEventData(currentWindowInfo);

      externalWindow.emit('bounds-changed', {
        changeType, deferred, height, left, reason, top, width
      });
    });
  }
}

/*
  Subsribes to global win32 events
*/
function subToGlobalWinEventHooks(): void {
  if (winEventHooksEmitters.has('*') || winEventHooksEmitters.has('**')) {
    // Already subscribed to global hooks
    return;
  }

  const globalWinEventHooks = new WinEventHookEmitter();
  const globalAllWindowsEventHooks = new WinEventHookEmitter({ skipOwnWindows: false });
  const listener = (
    parser: (nativeWindowInfo: Shapes.NativeWindowInfoLite) => void,
    sender: Event,
    rawNativeWindowInfo: NativeWindowInfo,
    timestamp: number,
    idObject: string,
    idChild: string
  ): void => {
    const nativeWindowInfo = getNativeWindowInfoLite(rawNativeWindowInfo);
    const ignoreVisibility = true;
    // idChild === '0' indicates that event is from main window, not a subcomponent.
    const isValid = isValidExternalWindow(rawNativeWindowInfo, ignoreVisibility) && idChild === '0';

    if (isValid) {
      parser(nativeWindowInfo);
    }
  };

  globalWinEventHooks.on('EVENT_OBJECT_DESTROY', listener.bind(null, (nativeWindowInfo: Shapes.NativeWindowInfo) => {
    const routeName = route.system('external-window-closed');
    ofEvents.emit(routeName, nativeWindowInfo);
  }));

  globalWinEventHooks.on('EVENT_OBJECT_CREATE', listener.bind(null, (nativeWindowInfo: Shapes.NativeWindowInfo) => {
    const routeName = route.system('external-window-created');
    ofEvents.emit(routeName, nativeWindowInfo);
  }));

  globalWinEventHooks.on('EVENT_OBJECT_HIDE', listener.bind(null, (nativeWindowInfo: Shapes.NativeWindowInfo) => {
    const routeName = route.system('external-window-hidden');
    ofEvents.emit(routeName, nativeWindowInfo);
  }));

  globalWinEventHooks.on('EVENT_OBJECT_SHOW', listener.bind(null, (nativeWindowInfo: Shapes.NativeWindowInfo) => {
    const routeName = route.system('external-window-shown');
    ofEvents.emit(routeName, nativeWindowInfo);
  }));

  const hookupBlurEventSubscription = () => {
    const allNativeWindows = electronApp.getAllNativeWindowInfo(false);
    let previousFocusedNativeWindow: any = allNativeWindows.find((e: NativeWindowInfo) => e.focused);

    if (previousFocusedNativeWindow) {
      previousFocusedNativeWindow = getNativeWindowInfo(previousFocusedNativeWindow);
    } else {
      previousFocusedNativeWindow = { uuid: '' };
    }

    globalAllWindowsEventHooks.on('EVENT_OBJECT_FOCUS', (sender: Event, rawNativeWindowInfo: NativeWindowInfo) => {
      const nativeWindowInfo = getNativeWindowInfo(rawNativeWindowInfo);
      const previousIdentity = { uuid: previousFocusedNativeWindow.uuid };
      const previousFocusedRegisteredNativeWindow = getRegisteredExternalWindow(previousIdentity);

      if (
        previousFocusedRegisteredNativeWindow &&
        previousFocusedRegisteredNativeWindow.uuid !== nativeWindowInfo.uuid
      ) {
        previousFocusedRegisteredNativeWindow.emit('blurred');
      }

      previousFocusedNativeWindow = nativeWindowInfo;
    });
  };

  hookupBlurEventSubscription();

  winEventHooksEmitters.set('*', globalWinEventHooks);
  winEventHooksEmitters.set('**', globalAllWindowsEventHooks);
}

/*
  Subscribe to win32 events and propogate appropriate events to native window.
*/
function subscribeToWinEventHooks(externalWindow: Shapes.ExternalWindow): void {
  const { nativeId } = externalWindow;
  const pid = electronApp.getProcessIdForNativeId(nativeId);
  const key = getKey(externalWindow);
  const winEventHooks = new WinEventHookEmitter({ pid });
  winEventHooksEmitters.set(key, winEventHooks);

  let previousNativeWindowInfo: NativeWindowInfo | Shapes.NativeWindowInfo = electronApp.getNativeWindowInfoForNativeId(nativeId);

  const listener = (
    parser: (nativeWindowInfo: Shapes.NativeWindowInfo) => void,
    sender: Event,
    rawNativeWindowInfo: NativeWindowInfo,
    timestamp: number,
    idObject: string,
    idChild: string
  ): void => {
    const nativeWindowInfo = getNativeWindowInfo(rawNativeWindowInfo);

    // We are subscribing to a process, so we only care about a specific window.
    // idChild === '0' indicates that event is from main window, not a subcomponent.
    if (nativeWindowInfo.uuid !== nativeId || idChild !== '0') {
      return;
    }
    parser(nativeWindowInfo);
    previousNativeWindowInfo = nativeWindowInfo;
  };

  winEventHooks.on('EVENT_OBJECT_SHOW', listener.bind(null, () => {
    externalWindow.emit('shown');
  }));

  winEventHooks.on('EVENT_OBJECT_HIDE', listener.bind(null, () => {
    externalWindow.emit('hidden', { reason: 'hide' });
  }));

  winEventHooks.on('EVENT_OBJECT_DESTROY', listener.bind(null, () => {
    externalWindowCloseCleanup(externalWindow);
  }));

  winEventHooks.on('EVENT_OBJECT_FOCUS', listener.bind(null, () => {
    externalWindow.emit('focused');
  }));

  winEventHooks.on('EVENT_SYSTEM_MOVESIZESTART', listener.bind(null, (nativeWindowInfo: Shapes.NativeWindowInfo) => {
    if (!externalWindow._userMovement) {
      return;
    }

    const {
      height, left, top, width, windowState
    } = getEventData(nativeWindowInfo);

    externalWindow.emit('begin-user-bounds-changing', {
      height, left, top, width, windowState
    });
  }));

  winEventHooks.on('EVENT_SYSTEM_MOVESIZEEND', listener.bind(null, (nativeWindowInfo: Shapes.NativeWindowInfo) => {
    if (!externalWindow._userMovement) {
      return;
    }

    const {
      changeType, deferred, height, left, reason, top, width, windowState
    } = getEventData(nativeWindowInfo);

    externalWindow.emit('end-user-bounds-changing', {
      height, left, top, width, windowState
    });

    externalWindow.emit('bounds-changed', {
      changeType, deferred, height, left, reason, top, width
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
      const {
        changeType, deferred, height, left, reason, top, width
      } = getEventData(nativeWindowInfo);

      externalWindow.emit('bounds-changing', {
        changeType, deferred, height, left, reason, top, width
      });
    }
  }));
}

// Window grouping stub (makes external windows work with our original disabled frame group tracker)
// Also some of the _options' values are needed in OpenFin Layouts
function setAdditionalProperties(externalWindow: Shapes.ExternalWindow, properIdentity: Shapes.NativeWindowIdentity): Shapes.GroupWindow {
  const { nativeId } = externalWindow;
  const uuid = properIdentity.uuid || nativeId;
  const name = properIdentity.name || nativeId;
  const identity = { uuid, name, nativeId };

  externalWindow._userMovement = true;
  externalWindow._options = {
    alwaysOnTop: false,
    frame: true,
    maximizable: true,
    name,
    opacity: 1,
    resizable: true,
    showTaskbarIcon: true,
    uuid
  };
  externalWindow.browserWindow = externalWindow;
  externalWindow.isExternalWindow = true;
  externalWindow.app_uuid = uuid;
  externalWindow.name = name;
  externalWindow.uuid = uuid;
  externalWindow.setUserMovementEnabled = async (enableUserMovement: boolean): Promise<void> => {
    if (enableUserMovement) {
      await enableExternaWindowUserMovement(identity);
    } else {
      await disableExternalWindowUserMovement(identity);
    }
  };

  return externalWindow;
}

// Subscribe to injection events
async function subscribeToInjectionEvents(externalWindow: Shapes.ExternalWindow): Promise<void> {
  const { uuid, name } = externalWindow;
  const injectionBus = getInjectionBus(externalWindow);
  const parseEvent = (data: any) => {
    const { userMovement, bottom, left, right, top, mouseX, mouseY } = data;
    return {
      changeType: 0, // TODO: use real value
      deferred: false, // TODO: use real value
      frame: true, // TODO: use real value
      height: bottom - top,
      left,
      top,
      userMovement,
      width: right - left,
      x: typeof left === 'number' ? left : mouseX,
      y: typeof top === 'number' ? top : mouseY
    };
  };

  injectionBus.on('*', (data: any) => {
    const { userMovement } = data;
    externalWindow._userMovement = userMovement;
  });

  injectionBus.on('WM_SIZING', (data: any) => {
    const { changeType, deferred, userMovement, height, left, top, width, x, y } = parseEvent(data);
    const routeName = route.externalWindow(OF_EVENT_FROM_WINDOWS_MESSAGE.WM_SIZING, uuid, name);
    if (!userMovement) {
      ofEvents.emit(routeName, { x, y, width, height });
      externalWindow.emit('disabled-movement-bounds-changing', {
        changeType, deferred, height, left, top, width
      });
    }
  });

  injectionBus.on('WM_MOVING', (data: any) => {
    const { changeType, deferred, userMovement, height, left, top, width } = parseEvent(data);
    const routeName = route.externalWindow(OF_EVENT_FROM_WINDOWS_MESSAGE.WM_MOVING, uuid, name);
    if (!userMovement) {
      ofEvents.emit(routeName);
      externalWindow.emit('disabled-movement-bounds-changing', {
        changeType, deferred, height, left, top, width
      });
    }
  });

  injectionBus.on('WM_ENTERSIZEMOVE', (data: any) => {
    const { userMovement, x, y } = parseEvent(data);
    const routeName = route.externalWindow(OF_EVENT_FROM_WINDOWS_MESSAGE.WM_ENTERSIZEMOVE, uuid, name);
    if (!userMovement) {
      ofEvents.emit(routeName, { userMovement, x, y });
    }
  });

  injectionBus.on('WM_EXITSIZEMOVE', (data: any) => {
    const { changeType, deferred, userMovement } = parseEvent(data);
    const { height, left, top, width } = getExternalWindowBounds(externalWindow);
    const routeName = route.externalWindow(OF_EVENT_FROM_WINDOWS_MESSAGE.WM_EXITSIZEMOVE, uuid, name);
    if (!userMovement) {
      ofEvents.emit(routeName);
      externalWindow.emit('disabled-movement-bounds-changed', {
        // TODO: height, left, top, width are currently undefined here as
        // we are not receiving them in this event's data
        changeType, deferred, height, left, top, width
      });
    }
  });
}

/*
    Decides whether external window is valid (external window filtering)
*/
export function isValidExternalWindow(rawNativeWindowInfo: NativeWindowInfo, ignoreVisibility?: boolean) {
  const nativeWindowInfo = getNativeWindowInfo(rawNativeWindowInfo);
  const classNamesToIgnore = [
    // TODO: Edge, calculator, etc (looks like they are always
    // "opened" and "visible", but at least visiblity part is wrong)
    'ApplicationFrameWindow',

    'TaskListOverlayWnd',
    'Windows.UI.Core.CoreWindow'
  ];
  const titlesToIgnore = [
    'Cortana',
    'Microsoft Store',
    'Program Manager',
    'Settings',
    'Start',
    'Window Search'
  ];
  const { title, visible } = nativeWindowInfo;
  const classNameOk = !classNamesToIgnore.includes(nativeWindowInfo.className);
  const titleOk = !titlesToIgnore.includes(nativeWindowInfo.title);
  const registered = externalWindows.has(nativeWindowInfo.uuid);
  const validVisibility = ignoreVisibility ? true : visible;

  return classNameOk && !!title && titleOk && (validVisibility || registered);
}

/*
    Perform a cleanup on external window's close
*/
function externalWindowCloseCleanup(externalWindow: Shapes.ExternalWindow): void {
  const key = getKey(externalWindow);
  const { nativeId } = externalWindow;
  const winEventHooks = winEventHooksEmitters.get(key);
  const injectionBus = injectionBuses.get(key);
  const externalWindowEventAdapter = externalWindowEventAdapters.get(key);
  const windowGroupUnSubscription = windowGroupUnSubscriptions.get(key);

  externalWindow.emit('closing');
  disabledUserMovementRequestorCount.delete(key);

  winEventHooks.removeAllListeners();
  winEventHooksEmitters.delete(key);

  injectionBus.removeAllListeners();
  injectionBuses.delete(key);

  windowGroupUnSubscription();
  windowGroupUnSubscriptions.delete(key);

  externalWindowEventAdapter.removeAllListeners();
  externalWindowEventAdapters.delete(key);

  externalWindow.emit('closed');
  externalWindow.removeAllListeners();
  externalWindows.delete(nativeId);
}

/*
    Subscribe to window group events
*/
function subscribeToWindowGroupEvents(externalWindow: Shapes.ExternalWindow): void {
  const key = getKey(externalWindow);
  const { nativeId, name } = externalWindow;
  const listener = (event: GroupChangedEvent) => {
    if (event.groupUuid !== externalWindow.groupUuid) {
      return;
    }

    const payload: GroupEvent = {
      ...event.payload,
      memberOf: '',
      name,
      uuid: nativeId
    };
    const { reason, sourceGroup, sourceWindowName } = payload;

    if (reason === 'disband') {
      payload.memberOf = 'nothing';
    } else if (reason === 'leave') {
      payload.memberOf = sourceWindowName === nativeId ? 'nothing' : 'source';
    } else {
      const isSource = sourceGroup.find((e: any) => e.windowName === nativeId);
      payload.memberOf = isSource ? 'source' : 'target';
    }

    externalWindow.emit('group-changed', payload);
  };

  WindowGroups.on('group-changed', listener);
  windowGroupUnSubscriptions.set(key, () => {
    WindowGroups.removeListener('group-changed', listener);
  });
}

/*
    Use raw native window info to generate various OpenFin event data that
    individual events can use for its properties.
*/
function getEventData(nativeWindowInfo: Shapes.NativeWindowInfo) {
  const windowState = nativeWindowInfo.maximized
    ? 'maximized'
    : nativeWindowInfo.minimized
      ? 'minimized'
      : 'normal';

  return {
    changeType: 0, // TODO: use real value
    deferred: false, // TODO: use real value
    frame: true, // TODO: use real value
    height: nativeWindowInfo.bounds.height,
    left: nativeWindowInfo.bounds.x,
    reason: 'self',
    top: nativeWindowInfo.bounds.y,
    width: nativeWindowInfo.bounds.width,
    windowState,
    x: nativeWindowInfo.bounds.x,
    y: nativeWindowInfo.bounds.y
  };
}
