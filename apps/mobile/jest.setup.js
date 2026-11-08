// Mock @expo/vector-icons to prevent "Module 1 is missing from asset registry" in Jest node environment
jest.mock('@expo/vector-icons/MaterialIcons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  function MockMaterialIcons(props) {
    const { name, testID, ...rest } = props;
    return React.createElement(Text, { testID: testID, ...rest }, name);
  }
  MockMaterialIcons.font = { 'material-icons': 1 };
  return MockMaterialIcons;
});

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const MockIcon = function (props) {
    const { name, testID, ...rest } = props;
    return React.createElement(Text, { testID: testID, ...rest }, name);
  };
  return new Proxy({}, {
    get: () => MockIcon,
  });
});

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  const mockComponent = ({ children }) => children;
  return {
    __esModule: true,
    SafeAreaProvider: mockComponent,
    SafeAreaConsumer: ({ children }) => children(insets),
    SafeAreaView: mockComponent,
    useSafeAreaInsets: () => insets,
    default: {
      SafeAreaProvider: mockComponent,
      SafeAreaConsumer: ({ children }) => children(insets),
      SafeAreaView: mockComponent,
      useSafeAreaInsets: () => insets,
    },
  };
});

const React = require('react');
const RNTL = require('@testing-library/react-native');
const actModule = require('@testing-library/react-native/dist/act.js');
const renderModule = require('@testing-library/react-native/dist/render.js');
const screenModule = require('@testing-library/react-native/dist/screen.js');
const testRendererModule = require('test-renderer');
const withinModule = require('@testing-library/react-native/dist/within.js');
const hostComponentNames = require('@testing-library/react-native/dist/helpers/host-component-names.js');
const cleanupModule = require('@testing-library/react-native/dist/cleanup.js');

const origAct = actModule.act;
actModule.act = function (callback) {
  let isPromise = false;
  let result;
  try {
    React.act(() => {
      result = callback();
      if (result && typeof result.then === 'function') {
        isPromise = true;
      }
    });
  } catch (err) {
    throw err;
  }
  if (isPromise) {
    return origAct(() => result);
  }
  return Promise.resolve(result);
};

function syncRender(element, options = {}) {
  const { wrapper: Wrapper } = options || {};
  const wrap = (el) => (Wrapper ? React.createElement(Wrapper, null, el) : el);
  const rendererOptions = {
    textComponentTypes: hostComponentNames.HOST_TEXT_NAMES,
    publicTextComponentTypes: ['Text'],
  };

  const renderer = testRendererModule.createRoot(rendererOptions);
  React.act(() => {
    renderer.render(wrap(element));
  });

  const rerender = (newElement) => {
    React.act(() => {
      renderer.render(wrap(newElement));
    });
    return Promise.resolve();
  };

  const unmount = () => {
    React.act(() => {
      renderer.unmount();
    });
    return Promise.resolve();
  };

  const toJSON = () => {
    const json = renderer.container.toJSON();
    if (json?.children?.length === 0) return null;
    if (json?.children?.length === 1 && typeof json.children[0] !== 'string') {
      return json.children[0];
    }
    return json;
  };

  cleanupModule.addToCleanupQueue(unmount);

  const queries = withinModule.getQueriesForInstance(renderer.container);

  const result = {
    ...queries,
    rerender,
    unmount,
    toJSON,
    debug: () => {
      const json = renderer.container.toJSON();
      if (json) console.log(JSON.stringify(json, null, 2));
    },
    get container() {
      return renderer.container;
    },
    get root() {
      return renderer.container.children[0];
    },
  };

  screenModule.setRenderResult(result);

  const promise = Promise.resolve(result);
  Object.assign(promise, result);
  promise.rerender = rerender;
  promise.unmount = unmount;
  return promise;
}

renderModule.render = syncRender;
RNTL.render = syncRender;

const { cleanup } = RNTL;
global.__node_util__ = require('util');

// Mocks for Expo SDK 58 security libraries
jest.mock('expo-crypto', () => {
  const nodeCrypto = require('crypto');
  return {
    CryptoDigestAlgorithm: {
      SHA1: 'SHA-1',
      SHA256: 'SHA-256',
      SHA384: 'SHA-384',
      SHA512: 'SHA-512',
    },
    CryptoEncoding: {
      HEX: 'hex',
      BASE64: 'base64',
    },
    digestStringAsync: jest.fn(async (algorithm, data, options) => {
      const algoMap = {
        'SHA-1': 'sha1',
        'SHA-256': 'sha256',
        'SHA-384': 'sha384',
        'SHA-512': 'sha512',
      };
      const nodeAlgo = algoMap[algorithm] || 'sha256';
      const encoding = options?.encoding === 'base64' ? 'base64' : 'hex';
      return nodeCrypto.createHash(nodeAlgo).update(data, 'utf8').digest(encoding);
    }),
    getRandomBytes: jest.fn((byteCount) => {
      const bytes = nodeCrypto.randomBytes(byteCount);
      return new Uint8Array(bytes);
    }),
    getRandomBytesAsync: jest.fn(async (byteCount) => {
      const bytes = nodeCrypto.randomBytes(byteCount);
      return new Uint8Array(bytes);
    }),
    randomUUID: jest.fn(() => nodeCrypto.randomUUID()),
  };
});

const mockSecureStoreMap = new Map();
jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK: 0,
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 1,
  ALWAYS: 2,
  WHEN_PASSCODE_SET_THIS_DEVICE_ONLY: 3,
  ALWAYS_THIS_DEVICE_ONLY: 4,
  WHEN_UNLOCKED: 5,
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6,
  isAvailableAsync: jest.fn(async () => true),
  getItemAsync: jest.fn(async (key) => {
    return mockSecureStoreMap.has(key) ? mockSecureStoreMap.get(key) : null;
  }),
  setItemAsync: jest.fn(async (key, value) => {
    mockSecureStoreMap.set(key, String(value));
  }),
  deleteItemAsync: jest.fn(async (key) => {
    mockSecureStoreMap.delete(key);
  }),
  __mockStore: mockSecureStoreMap,
}));

jest.mock('expo-local-authentication', () => ({
  AuthenticationType: {
    FINGERPRINT: 1,
    FACIAL_RECOGNITION: 2,
    IRIS: 3,
  },
  SecurityLevel: {
    NONE: 0,
    SECRET: 1,
    BIOMETRIC: 2,
  },
  hasHardwareAsync: jest.fn(async () => true),
  isEnrolledAsync: jest.fn(async () => true),
  supportedAuthenticationTypesAsync: jest.fn(async () => [1, 2]),
  getEnrolledLevelAsync: jest.fn(async () => 2),
  authenticateAsync: jest.fn(async () => ({ success: true })),
  cancelAuthenticate: jest.fn(async () => {}),
}));

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(async () => ({
    canceled: false,
    assets: [
      {
        uri: 'file:///mock/b3.xlsx',
        name: 'b3-movimentacao-exemplo.xlsx',
        size: 1234,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    ],
  })),
}));

jest.mock('expo-file-system', () => ({
  readAsStringAsync: jest.fn(async () => 'mock-content'),
  EncodingType: {
    Base64: 'base64',
    UTF8: 'utf8',
  },
  documentDirectory: 'file:///mock/documents/',
  cacheDirectory: 'file:///mock/cache/',
}));

const { toHaveTextContent: rntlToHaveTextContent } = require('@testing-library/react-native/dist/matchers/to-have-text-content');

expect.extend({
  toHaveTextContent(instance, expectedText, options) {
    return rntlToHaveTextContent.call(this, instance, expectedText, {
      exact: false,
      ...options,
    });
  },
});

afterEach(async () => {
  mockSecureStoreMap.clear();
  try {
    const { sessionStore } = require('./src/stores/sessionStore');
    sessionStore.setStatus('loading');
    sessionStore.markBackgrounded(0);
  } catch {}
  await cleanup();
});
