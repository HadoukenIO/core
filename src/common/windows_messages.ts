export const WINDOWS_MESSAGE_MAP = <{ [key: string]: string | number; }>{
  'WM_DESTROY': 0x0002, // 2
  0x0002: 'WM_DESTROY',

  'WM_MOVE': 0x0003, // 3
  0x0003: 'WM_MOVE',

  'WM_SETFOCUS': 0x0007, // 7
  0x0007: 'WM_SETFOCUS',

  'WM_KILLFOCUS': 0x0008, // 8
  0x0008: 'WM_KILLFOCUS',

  'WM_WINDOWPOSCHANGING': 0x0046, // 70
  0x0046: 'WM_WINDOWPOSCHANGING',

  'WM_WINDOWPOSCHANGED': 0x0047, // 71
  0x0047: 'WM_WINDOWPOSCHANGED',

  'WM_NCLBUTTONDBLCLK': 0x00A3, // 163
  0x00A3: 'WM_NCLBUTTONDBLCLK',

  'WM_KEYDOWN': 0x0100, // 256
  0x0100: 'WM_KEYDOWN',

  'WM_KEYUP': 0x0101, // 257
  0x0101: 'WM_KEYUP',

  'WM_SYSKEYDOWN': 0x0104, //260
  0x0104: 'WM_SYSKEYDOWN',

  'WM_SYSKEYUP': 0x0105, //261
  0x0105: 'WM_SYSKEYUP',

  'WM_SYSCOMMAND': 0x0112, // 274
  0x0112: 'WM_SYSCOMMAND',

  'WM_SIZING': 0x0214, // 532
  0x0214: 'WM_SIZING',

  'WM_CAPTURECHANGED': 0x0215, // 533
  0x0215: 'WM_CAPTURECHANGED',

  'WM_MOVING': 0x0216, // 534
  0x0216: 'WM_MOVING',

  'WM_ENTERSIZEMOVE': 0x0231, // 561
  0x0231: 'WM_ENTERSIZEMOVE',

  'WM_EXITSIZEMOVE': 0x0232, // 562
  0x0232: 'WM_EXITSIZEMOVE'
};

export const OF_EVENT_FROM_WINDOWS_MESSAGE = <{ [key: string]: string; }>{
  'WM_KILLFOCUS': 'blurred',
  0x0008: 'blurred', // 8

  'WM_SIZING': 'sizing',
  0x0214: 'WM_SIZING', // 532

  'WM_MOVING': 'moving',
  0x0216: 'moving', // 534

  'WM_ENTERSIZEMOVE': 'begin-user-bounds-change',
  0x0231: 'begin-user-bounds-change', // 561

  'WM_EXITSIZEMOVE': 'end-user-bounds-change',
  0x0232: 'end-user-bounds-change' // 562
};
