const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..', '..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

config.resolver.alias = {
  ...(config.resolver.alias || {}),
  'react-native-safe-area-context': path.resolve(projectRoot, 'vendor/react-native-safe-area-context'),
  '@shared': path.resolve(workspaceRoot, 'packages/shared/src'),
  '@': path.resolve(projectRoot, 'src'),
};

module.exports = config;
