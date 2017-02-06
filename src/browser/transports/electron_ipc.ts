/*
Copyright 2017 OpenFin Inc.

Licensed under OpenFin Commercial License you may not use this file except in compliance with your Commercial License.
Please contact OpenFin Inc. at sales@openfin.co to obtain a Commercial License.
*/
import {ipcMain as ipc} from 'electron';

const channels = {
    CORE_MESSAGE: 'of-core-message',
    WINDOW_MESSAGE: 'of-window-message'
};

export {channels, ipc};
