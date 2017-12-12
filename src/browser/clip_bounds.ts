/*
Copyright 2017 OpenFin Inc.

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
import { BrowserWindow, Rectangle } from 'electron';

export default clipBounds;

/**
 * Clip width and height values to be within allowed maximum
 */
function clipBounds(bounds: Rectangle, browserWindow: BrowserWindow): Rectangle {
    if (!('_options' in browserWindow)) {
        return bounds;
    }

    const {
        minWidth,
        minHeight,
        maxWidth,
        maxHeight
    } = browserWindow._options;

    return {
        x: bounds.x,
        y: bounds.y,
        width: clamp(bounds.width, minWidth, maxWidth),
        height: clamp(bounds.height, minHeight, maxHeight)
    };
}

/**
 * Adjust the number to be within the range of minimum and maximum values
 */
function clamp(num: number, min: number = 0, max: number = Number.MAX_SAFE_INTEGER): number {
    max = max < 0 ? Number.MAX_SAFE_INTEGER : max;
    return Math.min(Math.max(num, min, 0), max);
}
