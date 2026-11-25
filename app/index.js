import { AppRegistry } from 'react-native';
import App from './src/App';
import { name as appName } from './app.json';
import { uniffiInitAsync } from 'react-native-swiftshare-core';

// UniFFI/WASM bindings must initialize asynchronously before the engine is used.
uniffiInitAsync()
  .then(() => {
    AppRegistry.registerComponent(appName, () => App);
  })
  .catch((e) => {
    // Still register so the UI can show a readable error instead of a blank screen.
    console.error('uniffiInitAsync failed:', e);
    AppRegistry.registerComponent(appName, () => App);
  });
