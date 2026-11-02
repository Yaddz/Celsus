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
afterEach(async () => {
  await cleanup();
});
