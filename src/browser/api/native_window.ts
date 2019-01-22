import { Bounds } from '../../../js-adapter/src/shapes';
import { BrowserWindow, Rectangle } from 'electron';
import { clipBounds, windowSetBoundsToVisible } from '../utils';
import { toSafeInt } from '../../common/safe_int';
import * as Shapes from '../../shapes';

// TODO: remove this
export function noop(browserWindow: BrowserWindow) {

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
  const { anchor, deltaHeight, deltaWidth } = opts;

  if (browserWindow.isMaximized()) {
    browserWindow.unmaximize();
  }

  const bounds = browserWindow.getBounds();
  const newWidth = toSafeInt(bounds.width + deltaWidth, bounds.width);
  const newHeight = toSafeInt(bounds.height + deltaHeight, bounds.height);
  const { x, y } = calcBoundsAnchor(anchor, newWidth, newHeight, bounds);
  const clippedBounds = clipBounds({ x, y, width: newWidth, height: newHeight }, browserWindow);
  
  browserWindow.setBounds(clippedBounds);
}

export function resizeTo(browserWindow: BrowserWindow, opts: Shapes.ResizeWindowToOpts): void {
  const { anchor, height, width } = opts;
  
  if (browserWindow.isMaximized()) {
    browserWindow.unmaximize();
  }

  const bounds = browserWindow.getBounds();
  const newWidth = toSafeInt(width, bounds.width);
  const newHeight = toSafeInt(height, bounds.height);
  const { x, y } = calcBoundsAnchor(anchor, newWidth, newHeight, bounds);
  const clippedBounds = clipBounds({ x, y, width: newWidth, height: newHeight }, browserWindow);

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
