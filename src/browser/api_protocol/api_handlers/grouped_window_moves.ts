import { ActionSpecMap } from '../shapes';
import { getWindowByUuidName } from '../../core_state';
import { setNewGroupedWindowBounds, updateGroupedWindowBounds } from '../../disabled_frame_group_tracker';
import { getTargetWindowIdentity } from './api_protocol_base';
import { RectangleBase } from '../../rectangle';
import { APIMessage, GroupWindow } from '../../../shapes';
import { AckFunc, AckPayload, NackFunc } from '../transport_strategy/ack';
import { findExternalWindow } from '../../api/external_window';

const unsupported = (payload: any) => {
    throw new Error('This action is not supported while grouped');
};
const hijackThese: { [key: string]: (payload: any) => ChangeType } = {
    'animate-window': unsupported,
    'disable-external-window-user-movement': unsupported,
    'disable-window-frame': unsupported,
    'enable-external-window-user-movement': unsupported,
    'enable-window-frame': unsupported,
    'move-external-window-by': makeGetChangeType(['deltaLeft', 'deltaTop'], ['x', 'y'], 'delta'),
    'move-external-window': makeGetChangeType(['left', 'top'], ['x', 'y'], 'absolute'),
    'move-window-by': makeGetChangeType(['deltaLeft', 'deltaTop'], ['x', 'y'], 'delta'),
    'move-window': makeGetChangeType(['left', 'top'], ['x', 'y'], 'absolute'),
    'resize-external-window-by': makeGetChangeType(['deltaHeight', 'deltaWidth'], ['height', 'width'], 'delta'),
    'resize-external-window': makeGetChangeType(['height', 'width'], ['height', 'width'], 'absolute'),
    'resize-window-by': makeGetChangeType(['deltaHeight', 'deltaWidth'], ['height', 'width'], 'delta'),
    'resize-window': makeGetChangeType(['height', 'width'], ['height', 'width'], 'absolute'),
    'set-external-window-bounds': makeGetChangeType(['left', 'top', 'height', 'width'], ['x', 'y', 'height', 'width'], 'absolute'),
    'set-window-bounds': makeGetChangeType(['left', 'top', 'height', 'width'], ['x', 'y', 'height', 'width'], 'absolute'),
    'show-at-window': makeGetChangeType(['left', 'top'], ['x', 'y'], 'absolute'),
    'show-external-window-at': makeGetChangeType(['left', 'top'], ['x', 'y'], 'absolute')
};
interface ChangeType extends Partial<RectangleBase> {
    change: 'delta' | 'absolute';
}
function makeGetChangeType(from: string[], to: (keyof Omit<ChangeType, 'change'>)[], change: 'delta' | 'absolute') {
    return (payload: any): ChangeType => from.reduce((accum: ChangeType, key, i) => {
        const value: number = payload[key];
        const translatedKey = to[i];
        accum[translatedKey] = value;
        return accum;
    }, <any>{ change });
}
export function hijackMovesForGroupedWindows(actions: ActionSpecMap) {
    const specMap: ActionSpecMap = {};
    Object.entries(actions).forEach(([action, endpoint]) => {
        if (!hijackThese[action]) {
            specMap[action] = endpoint;
        } else {
            if (typeof endpoint === 'function') {
                specMap[action] = (identity, message: APIMessage, ack: AckFunc, nack: NackFunc) => {
                    const { payload } = message;
                    const { uuid, name } = getTargetWindowIdentity(payload);
                    let window: GroupWindow|false = getWindowByUuidName(uuid, name);

                    // Check if the missing window is an external window
                    if (!window) {
                        window = findExternalWindow({ uuid });
                    }

                    const options = payload.options || { moveIndependently: false };

                    if (window && window.groupUuid && !options.moveIndependently) {
                        const changeType = hijackThese[action](payload);
                        const moved = changeType.change === 'delta'
                            ? updateGroupedWindowBounds(window, changeType)
                            : setNewGroupedWindowBounds(window, changeType);

                        if (action === 'show-at-window') {
                            const showWindow = <Function>specMap['show-window'];
                            showWindow(identity, message, ack, nack);

                        } else if (action === 'show-external-window-at') {
                            const showExternalWindow = <Function>specMap['show-external-window'];
                            showExternalWindow(identity, message)
                                .then(ack)
                                .catch(nack);

                        } else {
                            ack({ success: true });
                        }
                    } else {
                        let endpointReturnValue: any;

                        try {
                            endpointReturnValue = endpoint(identity, message, ack, nack);
                        } catch (error) {
                            return nack(error);
                        }

                        if (endpointReturnValue instanceof Promise) {
                            // Promise-based endpoint
                            endpointReturnValue.then((data) => {
                                ack(new AckPayload(data));
                            }).catch(nack);
                        } else if (endpointReturnValue !== undefined) {
                            // Synchronous endpoint with returned data
                            ack(new AckPayload(endpointReturnValue));
                        } else {
                            // Callback-based endpoint (takes care of calling ack/nack by itself)
                        }
                    }
                };
            }
        }
    });
    return specMap;
}
