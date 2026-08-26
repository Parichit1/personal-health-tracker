const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Allows importing generated Drizzle .sql migration files as raw text.
config.resolver.sourceExts.push('sql');

module.exports = config;
