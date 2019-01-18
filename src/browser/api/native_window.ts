import { BrowserWindow } from 'electron';
import { toSafeInt } from '../../common/safe_int';
import * as Shapes from '../../shapes';

// TODO: remove this
export function noop(browserWindow: BrowserWindow) {

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
