import {ipcMain as ipc} from 'electron';

const channels = {
    CORE_MESSAGE: 'of-core-message',
    WINDOW_MESSAGE: 'of-window-message'
};

export {channels, ipc};
