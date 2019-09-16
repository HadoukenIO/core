import { OpenFinWindow, Layout, LayoutContent, AppObj, CustomFrameOptions, LayoutComponent } from '../../shapes';
import * as coreState from '../core_state';
import { Window } from './window';
import * as BrowserView from './browser_view';

const path = require('path');


export async function create(id: number, options?: CustomFrameOptions, frameUrl?: string) {
    const {uuid, name, layout} = options;

    const win = Window.create(id, {
        uuid,
        name,
        url: frameUrl ? frameUrl : `file:///${path.resolve(`${__dirname}/../../../assets/default-frame.html`)}`
    });

    const viewOptions = {
        uuid,
        name: `${name}-main-view`,
        target: { uuid, name },
        url: layout.content[0].componentState.url
    };

    await BrowserView.create(viewOptions);
}
