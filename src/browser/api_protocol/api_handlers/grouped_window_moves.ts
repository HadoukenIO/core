import { ActionSpecMap } from '../shapes';
import { getWindowByUuidName } from '../../core_state';
import { setNewGroupedWindowBounds, updateGroupedWindowBounds } from '../../disabled_frame_group_tracker';
import { getTargetWindowIdentity } from './api_protocol_base';
import { RectangleBase } from '../../rectangle';
import { APIMessage } from '../../../shapes';
import { AckFunc } from '../transport_strategy/ack';
const hijackThese: { [key: string]: (payload: any) => ChangeType } = {
    // TODO  'disable-window-frame': disableWindowFrame,
    // TODO  'enable-window-frame': enableWindowFrame,
    'move-window': makeGetChangeType(['left', 'top'], ['x', 'y'], 'absolute'),
    'move-window-by': makeGetChangeType(['deltaLeft', 'deltaTop'], ['x', 'y'], 'delta'),
    'resize-window': makeGetChangeType(['height', 'width'], ['height', 'width'], 'absolute'),
    'resize-window-by': makeGetChangeType(['deltaHeight', 'deltaWidth'], ['height', 'width'], 'delta'),
    'set-window-bounds': makeGetChangeType(['left', 'top', 'height', 'width'], ['x', 'y', 'height', 'width'], 'absolute'),
    'show-at-window': makeGetChangeType(['left', 'top'], ['x', 'y'], 'absolute')
};

interface ChangeType extends Partial<RectangleBase> {
    change: 'delta' | 'absolute';
}
function makeGetChangeType(from: string[], to: (keyof ChangeType)[], change: 'delta' | 'absolute') {
    return (payload: any): ChangeType => from.reduce((accum: ChangeType, key, i) => {
        accum[to[i]] = payload[key];
        return accum;
    }, { change });
}
export function hijackMovesForGroupedWindows(actions: ActionSpecMap) {
    const specMap: ActionSpecMap = {};
    Object.entries(actions).forEach(([action, endpoint]) => {
        if (!hijackThese[action]) {
            specMap[action] = endpoint;
        } else {
            if (typeof endpoint === 'function') {
                specMap[action] = async (identity, message: APIMessage, ack: AckFunc, nack) => {
                    const { payload } = message;
                    const { uuid, name } = getTargetWindowIdentity(payload);
                    const wrapped = getWindowByUuidName(uuid, name);
                    if (wrapped && wrapped.groupUuid) {
                        const changeType = hijackThese[action](payload);
                        const moved = changeType.change === 'delta'
                            ? updateGroupedWindowBounds(wrapped, changeType)
                            : setNewGroupedWindowBounds(wrapped, changeType);
                        if (action === 'show-at-window') {
                            const showWindow = <Function>specMap['show-window'];
                            showWindow(identity, message, ack, nack);
                        } else {
                            ack({ success: true });
                        }
                    } else {
                        endpoint(identity, message, ack, nack);
                    }
                };
            }
        }
    });
    return specMap;
}