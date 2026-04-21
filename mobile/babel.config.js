// babel.config.js
//
// Required by Expo to transpile modern JavaScript and JSX into
// code that React Native's JavaScript engine (Hermes) can run.
//
// babel-preset-expo extends @babel/preset-env with React Native
// specific transforms (e.g. JSX → React.createElement calls).
// You should never need to change this file.

module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
