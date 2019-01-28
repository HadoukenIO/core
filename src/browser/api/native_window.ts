import { Bounds } from '../../../js-adapter/src/shapes';
import { BrowserWindow, Rectangle } from 'electron';
import { clipBounds, windowSetBoundsToVisible } from '../utils';
import { toSafeInt } from '../../common/safe_int';
import * as Shapes from '../../shapes';

export function noop(browserWindow: BrowserWindow) {
  // TODO: remove this
}

export function bringToFront(browserWindow: BrowserWindow): void {
  browserWindow.bringToFront();
}

export function close(browserWindow: BrowserWindow): void {
  browserWindow.close();
}

export function flash(browserWindow: BrowserWindow): void {
  browserWindow.flashFrame(true);
}

export function focus(browserWindow: BrowserWindow): void {
  browserWindow.focus();
}

export function getBounds(browserWindow: BrowserWindow): Bounds {
  const bounds = browserWindow.getBounds();

  // v5 compatibility: right and bottom should not be documented
  return {
    bottom: bounds.height + bounds.y,
    height: bounds.height,
    left: bounds.x,
    right: bounds.width + bounds.x,
    top: bounds.y,
    width: bounds.width
  };
}

export function getState(browserWindow: BrowserWindow): string {
  if (browserWindow.isMinimized()) {
    return 'minimized';
  } else if (browserWindow.isMaximized()) {
    return 'maximized';
  } else {
    return 'normal';
  }
}

export function hide(browserWindow: BrowserWindow): void {
  browserWindow.hide();
}

export function isVisible(browserWindow: BrowserWindow): boolean {
  return browserWindow.isVisible();
}

export function maximize(browserWindow: BrowserWindow): void {
  browserWindow.maximize();
}

export function minimize(browserWindow: BrowserWindow): void {
  browserWindow.minimize();
}

export function moveBy(browserWindow: BrowserWindow, opts: Shapes.MoveWindowByOpts): void {
  const { deltaLeft, deltaTop } = opts;
  const currentBounds = browserWindow.getBounds();
  const left = toSafeInt(deltaLeft, 0);
  const top = toSafeInt(deltaTop, 0);

  if (browserWindow.isMaximized()) {
    browserWindow.unmaximize();
  }

  // no need to call clipBounds here because width and height are not changing
  browserWindow.setBounds({
    x: currentBounds.x + left,
    y: currentBounds.y + top,
    width: currentBounds.width,
    height: currentBounds.height
  });
}

export function moveTo(browserWindow: BrowserWindow, opts: Shapes.MoveWindowToOpts): void {
  const { left, top } = opts;
  const currentBounds = browserWindow.getBounds();
  const safeX = toSafeInt(left);
  const safeY = toSafeInt(top);

  if (browserWindow.isMaximized()) {
    browserWindow.unmaximize();
  }

  // no need to call clipBounds here because width and height are not changing
  browserWindow.setBounds({
    x: safeX,
    y: safeY,
    width: currentBounds.width,
    height: currentBounds.height
  });
}

export function resizeBy(browserWindow: BrowserWindow, opts: Shapes.ResizeWindowByOpts): void {
  if (browserWindow.isMaximized()) {
    browserWindow.unmaximize();
  }

  const bounds = browserWindow.getBounds();
  const width = toSafeInt(bounds.width + opts.deltaWidth, bounds.width);
  const height = toSafeInt(bounds.height + opts.deltaHeight, bounds.height);
  const { x, y } = calcBoundsAnchor(opts.anchor, width, height, bounds);
  const clippedBounds = clipBounds({ x, y, width, height }, browserWindow);

  browserWindow.setBounds(clippedBounds);
}

export function resizeTo(browserWindow: BrowserWindow, opts: Shapes.ResizeWindowToOpts): void {
  if (browserWindow.isMaximized()) {
    browserWindow.unmaximize();
  }

  const bounds = browserWindow.getBounds();
  const width = toSafeInt(opts.width, bounds.width);
  const height = toSafeInt(opts.height, bounds.height);
  const { x, y } = calcBoundsAnchor(opts.anchor, width, height, bounds);
  const clippedBounds = clipBounds({ x, y, width: width, height }, browserWindow);

  browserWindow.setBounds(clippedBounds);
}

export function restore(browserWindow: BrowserWindow): void {
  if (browserWindow.isMinimized()) {
    windowSetBoundsToVisible(browserWindow);
    browserWindow.restore();
  } else if (browserWindow.isMaximized()) {
    browserWindow.unmaximize();
  } else {
    browserWindow.showInactive();
  }
}

export function setAsForeground(browserWindow: BrowserWindow): void {
  browserWindow.activate();
}

export function setBounds(browserWindow: BrowserWindow, opts: Bounds): void {
  if (browserWindow.isMaximized()) {
    browserWindow.unmaximize();
  }

  const bounds = browserWindow.getBounds();
  const x = toSafeInt(opts.left, bounds.x);
  const y = toSafeInt(opts.top, bounds.y);
  const width = toSafeInt(opts.width, bounds.width);
  const height = toSafeInt(opts.height, bounds.height);
  const clippedBounds = clipBounds({ x, y, width, height }, browserWindow);

  browserWindow.setBounds(clippedBounds);
}

export function show(browserWindow: BrowserWindow): void {
  const dontShow =
    // RUN-2905: To match v5 behavior, for maximized window, avoid showInactive() because it does an
    // erroneous restore(), an apparent Electron oversight (a restore _is_ needed in all other cases).
    // RUN-4122: For minimized window we should allow to show it when
    // it is hidden.
    browserWindow.isVisible() &&
    (browserWindow.isMinimized() || browserWindow.isMaximized());

  if (!dontShow) {
    browserWindow.showInactive();
  }
}

export function showAt(browserWindow: BrowserWindow, opts: Shapes.ShowWindowAtOpts): void {
  if (browserWindow.isMaximized()) {
    browserWindow.unmaximize();
  }

  const x = toSafeInt(opts.left);
  const y = toSafeInt(opts.top);
  const { height, width } = browserWindow.getBounds();

  // No need to call clipBounds here because width and height are not changing
  browserWindow.setBounds({ x, y, height, width });

  if (!browserWindow.isMinimized()) {
    browserWindow.showInactive();
  }
}

export function stopFlashing(browserWindow: BrowserWindow): void {
  browserWindow.flashFrame(false);
}

function calcBoundsAnchor(anchor: string, newWidth: number, newHeight: number, bounds: Rectangle) {
  const { x, y, width, height } = bounds;
  const calcAnchor = { x, y };

  if (!anchor) {
    return calcAnchor;
  }

  const [yAnchor, xAnchor] = anchor.split('-');

  if (yAnchor === 'bottom' && height !== newHeight) {
    calcAnchor.y = y + (height - newHeight);
  }

  if (xAnchor === 'right' && width !== newWidth) {
    calcAnchor.x = x + (width - newWidth);
  }

  return calcAnchor;
}
