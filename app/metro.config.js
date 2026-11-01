const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/** @type {import('@react-native/metro-config').MetroConfig} */
const config = {
  // 契约产物位于 app/ 之外，需加入监听与解析范围。
  watchFolders: [path.resolve(__dirname, '..', 'contracts')]
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);