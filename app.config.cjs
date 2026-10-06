module.exports = ({ config }) => {
  // console.log("config", config);
  return {
    ...config,
    android: {
      ...config.android,
      versionCode: 3,
    },
    extra: {
      ...(config.extra || {}),
      eas: {
        projectId: process.env.EAS_PROJECT_ID || config?.extra?.eas?.projectId,
      },
    },
  };
};
