
export type WindowRoute = (
    type: string,
    uuid?: string,
    name?: string,
    hyphenateUuidName?: boolean
) => string;

export type SimpleRoute = (
    type: string,
    subtopic?: string,
    subsubtopic?: string
) => string;

export interface Route {
    (
        channel: string,
        topic: string,
        subtopic?: string,
        subsubtopic?: string,
        hyphenateUuidName?: boolean
    ): string;

    'application': SimpleRoute;
    'channel': SimpleRoute;
    'connection': SimpleRoute;
    'external-application': SimpleRoute;
    'external-window': WindowRoute;
    'externalApplication': SimpleRoute;
    'externalWindow': WindowRoute;
    'frame': WindowRoute;
    'global-hotkey': SimpleRoute;
    'globalHotkey': SimpleRoute;
    'native-window': SimpleRoute;
    'nativeWindow': SimpleRoute;
    'runtime': SimpleRoute;
    'rvm-message-bus': SimpleRoute;
    'rvmMessageBus': SimpleRoute;
    'server': SimpleRoute;
    'system': SimpleRoute;
    'window': WindowRoute;

    [key: string]: SimpleRoute;
}

interface Context { hyphenateUuidName: boolean; }
const HYPHEN: Context = { hyphenateUuidName: true };

// NOTE: Always called bound to a context; see .bind() calls below.
// returns 'channel/type' if only channel and type given
// returns 'channel/type/subtopic' in only channel, type, and subtopic given
// returns 'channel/type/subtopic/subsubtopic' if channel, type, subtopic, subsubtopic given and !(this && this.hyphenateUuidName)
// returns 'channel/type/subtopic-subsubtopic' if channel, type, subtopic, subsubtopic given and !!(this && hyphenateUuidName)
// note that this.hyphenateUuidName is overriden with hyphenateUuidName param when true or false
function router(
    channel: string,
    type: string,
    subtopic?: string,
    subsubtopic?: string,
    hyphenateUuidName?: boolean
): string {
    let result = `${channel}/${type}`;

    if (subtopic) {
        result += `/${subtopic}`;

        if (subsubtopic) {
            if (typeof hyphenateUuidName !== 'boolean') {
                // tslint:disable-next-line:no-invalid-this (`this` is the bound context)
                hyphenateUuidName = this && this.hyphenateUuidName;
            }
            result += hyphenateUuidName ? '-' : '/';
            result += subsubtopic;
        }
    }
    return result;
}

const route: Route = <Route>router.bind(null);

route.application = <SimpleRoute>route.bind(null, 'application');
route.channel = <WindowRoute>router.bind(HYPHEN, 'channel');
route.connection = <SimpleRoute>router.bind(null, 'connection');
route.externalApplication = route['external-application'] = <SimpleRoute>router.bind(null, 'external-application');
route.externalWindow = route['external-window'] = <WindowRoute>router.bind(HYPHEN, 'external-window');
route.frame = <WindowRoute>router.bind(HYPHEN, 'frame');
route.globalHotkey = route['global-hotkey'] = <SimpleRoute>router.bind(null, 'global-hotkey');
route.nativeWindow = route['native-window'] = <SimpleRoute>router.bind(HYPHEN, 'native-window');
route.runtime = <SimpleRoute>router.bind(null, 'runtime');
route.rvmMessageBus = route['rvm-message-bus'] = <SimpleRoute>router.bind(null, 'rvm-message-bus');
route.server = <SimpleRoute>router.bind(null, 'server');
route.system = <SimpleRoute>router.bind(null, 'system');
route.window = <WindowRoute>router.bind(HYPHEN, 'window');

export default route;
