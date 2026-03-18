import { registerRootComponent } from 'expo';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import React from 'react';
import App from './App';

function Root() {
  return React.createElement(SafeAreaProvider, null, React.createElement(App));
}

registerRootComponent(Root);
