const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

/**
 * Metro configuration for SwiftShare.
 *
 * The Rust-backed core (`react-native-swiftshare-core`) is linked via
 * `file:../native-core`, i.e. a symlink pointing OUTSIDE the app directory.
 * Metro does not follow such symlinks by default, so we add the package root
 * to watchFolders and register both node_modules paths (standard monorepo setup).
 */
const projectRoot = __dirname;
const nativeCoreRoot = path.resolve(projectRoot, '../native-core');

const config = {
  watchFolders: [nativeCoreRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(nativeCoreRoot, 'node_modules'),
    ],
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
