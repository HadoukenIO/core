/*
Copyright 2018 OpenFin Inc.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { basename } from 'path';
import { BrowserWindow as OFBrowserWindow } from '../shapes';
import { BrowserWindow, Rectangle, screen, NativeWindowInfo } from 'electron';
import * as Shapes from '../shapes';

/*
  This function sets window's bounds to be in a visible area, in case
  the display where it was originally located was disconnected
*/
export function windowSetBoundsToVisible(browserWindow: OFBrowserWindow | BrowserWindow): void {
  const bounds = browserWindow.getBounds();
  const { workArea } = screen.getDisplayMatching(bounds);
  const windowIsOutsideOfDisplay =
    bounds.x > (workArea.x + workArea.width) || // outside the display on the right
    (bounds.x + bounds.width) < workArea.x || // outside the display on the left
    bounds.y > (workArea.y + workArea.height) || // outside below the display
    (bounds.y + bounds.height) < workArea.y; // outside above the display

  if (windowIsOutsideOfDisplay) {
    // Restore the window at the root of the nearest display
    // in case the display it was located at before is now
    // disconnected. This fixes the cases where the window
    // would be restored into a disconnected display and
    // wouldn't be seen by the user.
    browserWindow.setBounds({
      x: workArea.x,
      y: workArea.y,
      width: bounds.width,
      height: bounds.height
    });
  }
}

/*
  Clip width and height values to be within allowed maximum
*/
export function clipBounds(bounds: Rectangle, browserWindow: OFBrowserWindow | BrowserWindow): Rectangle {
  if (!('_options' in browserWindow)) {
    return bounds;
  }

  const { minWidth, minHeight, maxWidth, maxHeight } = browserWindow._options;

  return {
    x: bounds.x,
    y: bounds.y,
    width: clamp(bounds.width, minWidth, maxWidth),
    height: clamp(bounds.height, minHeight, maxHeight)
  };
}

/*
  Adjust the number to be within the range of minimum and maximum values
*/
function clamp(num: number, min: number = 0, max: number = Number.MAX_SAFE_INTEGER): number {
  max = max < 0 ? Number.MAX_SAFE_INTEGER : max;
  return Math.min(Math.max(num, min, 0), max);
}

/*
  Returns lite version of external window info object
*/
export function getNativeWindowInfoLite(rawNativeWindowInfo: NativeWindowInfo): Shapes.NativeWindowInfoLite {
  let name = capitalize(basename(rawNativeWindowInfo.process.imageName, '.exe'));

  if (name === 'ApplicationFrameHost') {
    name = rawNativeWindowInfo.title;
  }

  return {
    name,
    nativeId: rawNativeWindowInfo.id,
    process: {
      injected: rawNativeWindowInfo.process.injected,
      pid: rawNativeWindowInfo.process.pid
    },
    title: rawNativeWindowInfo.title,
    uuid: rawNativeWindowInfo.id,
    visible: rawNativeWindowInfo.visible
  };
}

/*
  Returns full version of external window info object
*/
export function getNativeWindowInfo(rawNativeWindowInfo: NativeWindowInfo): Shapes.NativeWindowInfo {
  const liteInfoObject = getNativeWindowInfoLite(rawNativeWindowInfo);

  return {
    ...liteInfoObject,
    alwaysOnTop: rawNativeWindowInfo.alwaysOnTop,
    bounds: rawNativeWindowInfo.bounds,
    className: rawNativeWindowInfo.className,
    dpi: rawNativeWindowInfo.dpi,
    dpiAwareness: rawNativeWindowInfo.dpiAwareness,
    focused: rawNativeWindowInfo.focused,
    maximized: rawNativeWindowInfo.maximized,
    minimized: rawNativeWindowInfo.minimized
  };
}

/*
  Capitalizes a string.
*/
export function capitalize(string: string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}
