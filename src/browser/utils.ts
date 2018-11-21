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

import { BrowserWindow } from '../shapes';
import { Rectangle, screen } from 'electron';

interface Clamped {
  value: number;
  clampedOffset: number;
}

/*
  This function sets window's bounds to be in a visible area, in case
  the display where it was originally located was disconnected
*/
export function windowSetBoundsToVisible(browserWindow: BrowserWindow): void {
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
export function clipBounds(bounds: Rectangle, browserWindow: BrowserWindow): Rectangle {
  if (!('_options' in browserWindow)) {
    return bounds;
  }

  const { minWidth, minHeight, maxWidth, maxHeight } = browserWindow._options;

  const xclamp = clamp(bounds.width, minWidth, maxWidth);
  const yclamp = clamp(bounds.height, minHeight, maxHeight);

  if (yclamp.clampedOffset || xclamp.clampedOffset) {
    // here is where we can indicate a "pushed" window and may need to check all bounds
  }

  return {
    x: bounds.x + xclamp.clampedOffset,
    y: bounds.y + yclamp.clampedOffset,
    width: xclamp.value,
    height: yclamp.value
  };
}

/*
  Adjust the number to be within the range of minimum and maximum values
*/
function clamp(num: number, min: number = 0, max: number = Number.MAX_SAFE_INTEGER): Clamped {
  max = max < 0 ? Number.MAX_SAFE_INTEGER : max;
  const value = Math.min(Math.max(num, min, 0), max);
  return {
    value,
    clampedOffset: num < min ? -1 * (min - num) : 0 || num > max ? -1 * (num - max) : 0
  };
}
