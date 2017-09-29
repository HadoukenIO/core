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
import { toSafeInt } from '../common/safe_int';
import clipBounds from './clip_bounds';

export { handleMove };

const isWin32 = process.platform === 'win32';

/**
 * Interface of window bounds that are passed in and need to be checked.
 */
interface Bounds {
    x?: number;
    y?: number;
    w?: number;
    h?: number;
}

function handleMove(windowId: string, bounds: Bounds): void {
    const browserWindow = BrowserWindow.fromId(windowId);

    if (isWin32 && browserWindow && (browserWindow.isMinimized() || browserWindow.isMaximized())) {
        const oldBounds: Rectangle = browserWindow.getBounds();
        const newBounds: Rectangle = {
            x: toSafeInt(bounds.x, oldBounds.x),
            y: toSafeInt(bounds.y, oldBounds.y),
            width: toSafeInt(bounds.w, oldBounds.width),
            height: toSafeInt(bounds.h, oldBounds.height)
        };

        browserWindow.setWindowPlacement(clipBounds(newBounds, browserWindow));

        // Emitting this event, because Electron doesn't
        // dispatch 'bounds-changed' event on setWindowPlacement
        browserWindow.emit('bounds-changed');
    }
}
