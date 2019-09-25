import { CustomFrameOptions } from '../../shapes';
import { Window } from './window';
const path = require('path');


export async function create(id: number, options?: CustomFrameOptions, frameUrl?: string) {
    const { uuid, name } = options;

    const win = Window.create(id, {
        uuid,
        name,
        autoShow: true,
        url: frameUrl ? frameUrl : `file:///${path.resolve(`${__dirname}/../../../assets/frame/default-frame.html`)}`
    });
}
