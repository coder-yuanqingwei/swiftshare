module.exports = {
  presets: ['module:@react-native/babel-preset'],
  // react-native-worklets-core 要求：必须放在 plugins 列表最后一位。
  // 用于 vision-camera 扫码所需的 worklet 转换。
  plugins: ['react-native-worklets-core/plugin'],
};
