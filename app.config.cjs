module.exports = ({ config }) => {
  // console.log("config", config);
  return {
    ...config,
    extra: {
      ...(config.extra || {}),
      eas: {
        projectId: process.env.EAS_PROJECT_ID || config?.extra?.eas?.projectId,
      },
    },
  };
};
