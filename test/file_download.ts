import * as mockery from 'mockery';
import { mockElectron } from './electron';
import * as assert from 'assert';
import route from '../src/common/route';
import { EventEmitter } from 'events';

// tslint:disable-next-line
const sinon = require('sinon');

class MockdownloadItem extends EventEmitter {
    public getURL = () => {
        return 'mock url';
    }
    public getMimeType = () => {
        return 'mock mimeType';
    }
    public getFilename = () => {
        return 'fileName';
    }
    public getTotalBytes = () => {
        return 5675309;
    }
    public getStartTime = () => {
        return Date.now();
    }
    public getContentDisposition = () => {
        return 'mock contentDisposition';
    }
    public getLastModifiedTime = () => {
        return 'mock modifiedDate';
    }
    public getETag = () => {
        return 'mock eTag';
    }
    public getReceivedBytes = () => {
        return 5675309;
    }
    public isPaused = () => {
        return false;
    }
    public getSavePath = () => {
        return 'mockFilePath';
    }
    public state: string = 'completed';
}

mockery.registerMock('electron', mockElectron);
mockery.registerMock('../core_state', {
    getWindowOptionsById: () => ({url: ''})
});
mockery.registerMock('./api/external_application', {});
mockery.enable({
    warnOnReplace: false,
    warnOnUnregistered: false
});

import { createWillDownloadEventListener, downloadLocationMap } from '../src/browser/api/file_download';
import ofEvents from '../src/browser/of_events';

describe('FileDownload', () => {

    afterEach(() => {
        downloadLocationMap.clear();
    });

    it('Should raise Window download started events', () => {
        const identity = { uuid: 'test', name: 'test' };
        const willDownloadListener = createWillDownloadEventListener(identity);
        const spy = sinon.spy();

        ofEvents.once(route.window('file-download-started', identity.uuid, identity.name), spy);
        willDownloadListener({}, new MockdownloadItem(), null);

        assert.ok(spy.calledOnce, 'Expected file download started event to have been fired');
    });

    it('Should raise Application download started events', () => {
        const identity = { uuid: 'test', name: 'test' };
        const willDownloadListener = createWillDownloadEventListener(identity);
        const spy = sinon.spy();

        ofEvents.once(route.application('window-file-download-started', identity.uuid), spy);
        willDownloadListener({}, new MockdownloadItem(), null);

        assert.ok(spy.calledOnce, 'Expected file download started event to have been fired');
    });

    it('Should raise System download started events', () => {
        const identity = { uuid: 'test', name: 'test' };
        const willDownloadListener = createWillDownloadEventListener(identity);
        const spy = sinon.spy();

        ofEvents.once(route.system('window-file-download-started'), spy);
        willDownloadListener({}, new MockdownloadItem(), null);

        assert.ok(spy.calledOnce, 'Expected file download started event to have been fired');
    });

    it('Should raise the download progress events', () => {
        const identity = { uuid: 'test', name: 'test' };
        const willDownloadListener = createWillDownloadEventListener(identity);
        const spy = sinon.spy();
        const mockItem = new MockdownloadItem();

        ofEvents.once(route.window('file-download-progress', identity.uuid, identity.name), spy);
        willDownloadListener({}, mockItem, null);
        mockItem.emit('updated', {}, 'progressing');

        assert.ok(spy.calledOnce, 'Expected file download progress event to have been fired');
    });

    it('Should raise the download completed progress events', () => {
        const identity = { uuid: 'test', name: 'test' };
        const willDownloadListener = createWillDownloadEventListener(identity);
        const spy = sinon.spy();
        const mockItem = new MockdownloadItem();

        ofEvents.once(route.window('file-download-completed', identity.uuid, identity.name), spy);
        willDownloadListener({}, mockItem, null);
        mockItem.emit('done', {}, 'completed');

        assert.ok(spy.calledOnce, 'Expected file download completed event to have been fired');
    });

    // tslint:disable-next-line
    it('Should update the downloadLocationMap only once the download has completed', function(done: any) {
        const identity = { uuid: 'test', name: 'test' };
        const willDownloadListener = createWillDownloadEventListener(identity);
        const mockItem = new MockdownloadItem();

        ofEvents.once(route.window('file-download-started', identity.uuid, identity.name), (evt) => {
            assert.deepStrictEqual(downloadLocationMap.has(evt.fileUuid), false, 'Expected file download to not exist in core state');
        });
        ofEvents.once(route.window('file-download-completed', identity.uuid, identity.name), (evt) => {
            assert.deepStrictEqual(downloadLocationMap.has(evt.fileUuid), true, 'Expected file download to exist in core state');
            done();
        });
        willDownloadListener({}, mockItem, null);
        mockItem.emit('done', {}, 'completed');
    });

    // tslint:disable-next-line
    it('Should clean the event listeners', function(done: any) {
        const identity = { uuid: 'test', name: 'test' };
        const willDownloadListener = createWillDownloadEventListener(identity);
        const mockItem = new MockdownloadItem();

        ofEvents.once(route.window('file-download-completed', identity.uuid, identity.name), (evt) => {
            assert.deepStrictEqual(mockItem.listenerCount('done'), 0, 'Expected done event to have no listeners');
            assert.deepStrictEqual(mockItem.listenerCount('updated'), 0, 'Expected done event to have no listeners');
            done();
        });
        willDownloadListener({}, mockItem, null);
        mockItem.emit('done', {}, 'completed');
    });

    // tslint:disable-next-line
    it('Should bind to the given identity', function(done: any) {
        const identity = { uuid: 'test', name: 'test' };
        const identity2 = { uuid: 'test2', name: 'test2' };
        const willDownloadListener = createWillDownloadEventListener(identity);
        const willDownloadListener2 = createWillDownloadEventListener(identity2);

        ofEvents.once(route.window('file-download-started', identity.uuid, identity.name), (evt) => {
            assert.deepStrictEqual(evt.uuid, identity.uuid, 'Expected file download to not exist in core state');
        });

        ofEvents.once(route.window('file-download-started', identity2.uuid, identity2.name), (evt) => {
            assert.deepStrictEqual(evt.uuid, identity2.uuid, 'Expected file download to not exist in core state');
            done();
        });

        willDownloadListener({}, new MockdownloadItem(), null);
        willDownloadListener2({}, new MockdownloadItem(), null);
    });

    it('Should only raise a single event per uuid', () => {
        const identity = { uuid: 'test', name: 'test' };
        const identity2 = { uuid: 'test2', name: 'test2' };
        const willDownloadListener = createWillDownloadEventListener(identity);
        const willDownloadListener2 = createWillDownloadEventListener(identity2);
        const spy = sinon.spy();

        ofEvents.once(route.system('window-file-download-started'), spy);
        willDownloadListener({}, new MockdownloadItem(), null);
        willDownloadListener2({}, new MockdownloadItem(), null);

        assert.ok(spy.calledOnce, 'Expected file download started event to have been fired');
    });
});
