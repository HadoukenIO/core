
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

    application: SimpleRoute;
    externalApplication: SimpleRoute;
    'external-application': SimpleRoute;

    frame: WindowRoute;
    window: WindowRoute;
    externalWindow: WindowRoute;
    'external-window': WindowRoute;

    system: SimpleRoute;
    channel: SimpleRoute;
    server: SimpleRoute;
    connection: SimpleRoute;
    runtime: SimpleRoute;

    rvmMessageBus: SimpleRoute;
    'rvm-message-bus': SimpleRoute;

    globalHotkey: SimpleRoute;
    'global-hotkey': SimpleRoute;
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
route.externalApplication = route['external-application'] = <SimpleRoute>router.bind(null, 'external-application');

route.frame = <WindowRoute>router.bind(HYPHEN, 'frame');
route.window = <WindowRoute>router.bind(HYPHEN, 'window');
route.externalWindow = route['external-window'] = <WindowRoute>router.bind(HYPHEN, 'external-window');

route.channel = <WindowRoute>router.bind(HYPHEN, 'channel');
route.system = <SimpleRoute>router.bind(null, 'system');
route.rvmMessageBus = route['rvm-message-bus'] = <SimpleRoute>router.bind(null, 'rvm-message-bus');
route.server = <SimpleRoute>router.bind(null, 'server');
route.connection = <SimpleRoute>router.bind(null, 'connection');
route.runtime = <SimpleRoute>router.bind(null, 'runtime');
route.globalHotkey = route['global-hotkey'] = <SimpleRoute>router.bind(null, 'global-hotkey');

export default route;
