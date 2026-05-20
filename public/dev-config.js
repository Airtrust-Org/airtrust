// Arquivo que SEMPRE será incluído em builds
// Configurações persistem mesmo após clones
window.AIRTRUST_DEV_CONFIG = {
  disableTracking: true,
  disableWarnings: true,
  fastMode: true,
  optimized: true,
  version: '2.0.0',
  features: {
    silenceFeaturePolicy: true,
    blockGoogleTagManager: true,
    disableSentry: true,
    filterConsoleWarnings: true,
    optimizePerformance: true
  },
  performance: {
    sourceMaps: false,
    tracking: false,
    warnings: false,
    fastReload: true
  }
};
