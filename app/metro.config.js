const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.resolver.extraNodeModules = {
  punycode: path.resolve(__dirname, 'node_modules/punycode'),
};

module.exports = config;
