// The SQL migrations of the local database (src/db/migrations/*.sql) are inlined as strings at build time.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [['inline-import', { extensions: ['.sql'] }]],
  };
};
