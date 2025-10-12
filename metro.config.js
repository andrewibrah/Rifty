const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.resolver.alias = {
  ...(config.resolver.alias || {}),
  'react-native-safe-area-context': path.resolve(__dirname, 'vendor/react-native-safe-area-context'),
  '@': path.resolve(__dirname, 'src'),
};

module.exports = config;
