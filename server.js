const { serveHTTP } = require('stremio-addon-sdk');
const addonInterface = require('./addon');

const PORT = process.env.PORT || 7000;

// Add health check endpoint for deployment platforms
const express = require('express');
const app = express();

// Health check endpoint
app.get('/', (req, res) => {
    res.send('German Streams Pro - Addon is running! Add /manifest.json to install in Stremio');
});

// Serve the addon
serveHTTP(addonInterface, { port: PORT });

console.log(`German Streams Pro addon running on http://localhost:${PORT}`);
console.log(`Install in Stremio: http://localhost:${PORT}/manifest.json`);
