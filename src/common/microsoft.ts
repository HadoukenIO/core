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

export enum SetWindowPosition {
    SWP_HIDEWINDOW = 0x80,
    SWP_SHOWWINDOW = 0x40
}

export enum SysCommands {
    SC_MAXIMIZE = 0xF030,
    SC_MINIMIZE = 0xF020,
    SC_RESTORE = 0xF120
}

export enum WindowsMessages {
    WM_DESTROY = 0x0002,
    WM_SETFOCUS = 0x0007,
    WM_KILLFOCUS = 0x0008,
    WM_WINDOWPOSCHANGED = 0x0047,
    WM_SYSCOMMAND = 0x0112,
    WM_NCLBUTTONDBLCLK = 0x00a3,
    WM_KEYDOWN = 0x0100,
    WM_KEYUP = 0x0101,
    WM_SYSKEYDOWN = 0x0104,
    WM_SYSKEYUP = 0x0105,
    WM_SIZING = 0x0214,
    WM_MOVING = 0x0216,
    WM_ENTERSIZEMOVE = 0x0231,
    WM_EXITSIZEMOVE = 0x0232,
    WM_WTSSESSION_CHANGE = 0x02B1
}
