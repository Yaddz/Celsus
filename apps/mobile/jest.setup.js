// Mock @expo/vector-icons to prevent "Module 1 is missing from asset registry" in Jest node environment
jest.mock('@expo/vector-icons/MaterialIcons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return function MockMaterialIcons(props) {
    const { name, testID, ...rest } = props;
    return React.createElement(Text, { testID: testID, ...rest }, name);
  };
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
