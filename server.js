const { serveHTTP } = require('stremio-addon-sdk');
const addonInterface = require('./addon');

const PORT = process.env.PORT || 7000;

// Serve the addon
serveHTTP(addonInterface, { port: PORT });

console.log(`German Streams Pro addon running on http://localhost:${PORT}`);
console.log(`Install in Stremio: http://localhost:${PORT}/manifest.json`);
