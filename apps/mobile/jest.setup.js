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

const { cleanup } = RNTL;
afterEach(async () => {
  await cleanup();
});
