/** @type {import('expo/config').ExpoConfig} */
const appJson = require('./app.json');

module.exports = {
  ...appJson.expo,
  android: {
    ...appJson.expo.android,
    versionCode: 1,
  },
  extra: {
    ...(appJson.expo.extra || {}),
    eas: {
      projectId: process.env.EAS_PROJECT_ID || appJson.expo.extra?.eas?.projectId,
    },
  },
};
