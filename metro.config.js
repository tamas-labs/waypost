// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// The SQL migrations of the local database are imported by src/db/migrations/migrations.js (Drizzle).
config.resolver.sourceExts.push('sql');

module.exports = config;
