const { addonBuilder } = require('stremio-addon-sdk');
const axios = require('axios');
const cheerio = require('cheerio');

// Addon manifest
const manifest = {
    id: 'org.germanstreams.extractor',
    version: '3.0.0',
    name: 'German Streams Pro',
    description: 'Direct German stream extraction from hdfilme.to',
    resources: ['stream'],
    types: ['movie', 'series'],
    catalogs: [],
    idPrefixes: ['tt'],
    logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/b/ba/Flag_of_Germany.svg/1200px-Flag_of_Germany.svg.png'
};

const builder = new addonBuilder(manifest);

const BASE_URL = 'https://hdfilme.my';

// Get TMDB info with German titles
async function getTMDBInfo(imdbId) {
    try {
        const response = await axios.get(`https://api.themoviedb.org/3/find/${imdbId}`, {
            params: {
                api_key: '0f49f92e8996c6033a0c89266499c2d6',
                external_source: 'imdb_id',
                language: 'de-DE'
            },
            timeout: 5000
        });
        
        return response.data.movie_results[0] || response.data.tv_results[0];
    } catch (error) {
        console.error('TMDB Error:', error.message);
        return null;
    }
}

// Extract VOE stream URL
async function extractVOEStream(voeUrl) {
    try {
        console.log('Extracting VOE stream from:', voeUrl);
        const response = await axios.get(voeUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': BASE_URL
            },
            timeout: 15000
        });
        
        const html = response.data;
        
        // VOE patterns - try multiple approaches
        const patterns = [
            /sources:\s*\[?\s*["']([^"']+\.m3u8[^"']*)/i,
            /hls:\s*["']([^"']+\.m3u8[^"']*)/i,
            /file:\s*["']([^"']+\.m3u8[^"']*)/i,
            /"hls":\s*["']([^"']+\.m3u8[^"']*)/i,
            /video_url["']?\s*:\s*["']([^"']+)/i
        ];
        
        for (const pattern of patterns) {
            const match = html.match(pattern);
            if (match && match[1]) {
                console.log('Found VOE stream:', match[1]);
                return match[1];
            }
        }
        
        return null;
    } catch (error) {
        console.error('VOE extraction error:', error.message);
        return null;
    }
}

// Extract Streamtape URL
async function extractStreamtapeStream(streamtapeUrl) {
    try {
        console.log('Extracting Streamtape stream from:', streamtapeUrl);
        const response = await axios.get(streamtapeUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': BASE_URL
            },
            timeout: 15000
        });
        
        const html = response.data;
        
        // Streamtape dynamic URL construction
        const tokenMatch = html.match(/getElementById\(['"](?:ideoooolink|norobotlink)['"]\)\.innerHTML\s*=\s*["']([^"']+)/);
        const linkMatch = html.match(/innerHTML\s*=\s*["']([^"']+)["']\s*\+\s*getElementById/);
        
        if (tokenMatch && linkMatch) {
            const streamUrl = `https:${linkMatch[1]}${tokenMatch[1]}`;
            console.log('Found Streamtape stream:', streamUrl);
            return streamUrl;
        }
        
        return null;
    } catch (error) {
        console.error('Streamtape extraction error:', error.message);
        return null;
    }
}

// Extract Doodstream URL
async function extractDoodstream(doodUrl) {
    try {
        console.log('Extracting Doodstream from:', doodUrl);
        const response = await axios.get(doodUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': BASE_URL
            },
            timeout: 15000
        });
        
        const html = response.data;
        
        // Doodstream uses a pass_md5 endpoint
        const passMatch = html.match(/\$\.get\(['"]\/pass_md5\/([^'"]+)['"]/);
        if (passMatch) {
            const domain = new URL(doodUrl).origin;
            const tokenUrl = `${domain}/pass_md5/${passMatch[1]}`;
            const tokenResponse = await axios.get(tokenUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                    'Referer': doodUrl
                }
            });
            
            if (tokenResponse.data) {
                const streamUrl = tokenResponse.data + 'zUEJeL3mUN?token=' + passMatch[1];
                console.log('Found Doodstream:', streamUrl);
                return streamUrl;
            }
        }
        
        return null;
    } catch (error) {
        console.error('Doodstream extraction error:', error.message);
        return null;
    }
}

// Find content page on hdfilme.to
async function findContentPage(title, year, type) {
    try {
        const searchUrl = `${BASE_URL}/search?q=${encodeURIComponent(title)}`;
        console.log('Searching:', searchUrl);
        
        const response = await axios.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 10000
        });
        
        const $ = cheerio.load(response.data);
        
        // Find the movie/series link from search results
        let contentUrl = null;
        
        $('.movielist-link, .movie-link, a[href*="/movie/"], a[href*="/serie/"]').each((i, elem) => {
            const href = $(elem).attr('href');
            const text = $(elem).text().toLowerCase();
            
            if (href && text.includes(title.toLowerCase().substring(0, 10))) {
                contentUrl = href.startsWith('http') ? href : BASE_URL + href;
                return false; // break
            }
        });
        
        return contentUrl;
    } catch (error) {
        console.error('Search error:', error.message);
        return null;
    }
}

// Get stream links from content page
async function getStreamLinks(contentUrl, season, episode) {
    try {
        console.log('Getting streams from:', contentUrl);
        
        // For series, we need to navigate to the specific episode
        let pageUrl = contentUrl;
        if (season && episode) {
            pageUrl = `${contentUrl}/staffel-${season}/episode-${episode}`;
        }
        
        const response = await axios.get(pageUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 10000
        });
        
        const $ = cheerio.load(response.data);
        const streams = [];
        
        // Look for player/hoster links
        const hosters = [];
        
        // Common patterns for embed links
        $('a[href*="voe"], a[data-link*="voe"], iframe[src*="voe"]').each((i, elem) => {
            const url = $(elem).attr('href') || $(elem).attr('data-link') || $(elem).attr('src');
            if (url && !hosters.includes(url)) {
                hosters.push({ type: 'voe', url });
            }
        });
        
        $('a[href*="streamtape"], a[data-link*="streamtape"], iframe[src*="streamtape"]').each((i, elem) => {
            const url = $(elem).attr('href') || $(elem).attr('data-link') || $(elem).attr('src');
            if (url && !hosters.includes(url)) {
                hosters.push({ type: 'streamtape', url });
            }
        });
        
        $('a[href*="dood"], a[data-link*="dood"], iframe[src*="dood"]').each((i, elem) => {
            const url = $(elem).attr('href') || $(elem).attr('data-link') || $(elem).attr('src');
            if (url && !hosters.includes(url)) {
                hosters.push({ type: 'dood', url });
            }
        });
        
        console.log(`Found ${hosters.length} hosters`);
        
        // Extract actual stream URLs
        for (const hoster of hosters.slice(0, 5)) {
            let streamUrl = null;
            
            if (hoster.type === 'voe') {
                streamUrl = await extractVOEStream(hoster.url);
                if (streamUrl) {
                    streams.push({
                        name: '🇩🇪 VOE',
                        title: 'German - VOE (HD)',
                        url: streamUrl,
                        behaviorHints: {
                            bingeGroup: 'german-voe',
                            countryWhitelist: ['DE', 'AT', 'CH']
                        }
                    });
                }
            } else if (hoster.type === 'streamtape') {
                streamUrl = await extractStreamtapeStream(hoster.url);
                if (streamUrl) {
                    streams.push({
                        name: '🇩🇪 Streamtape',
                        title: 'German - Streamtape',
                        url: streamUrl,
                        behaviorHints: {
                            bingeGroup: 'german-streamtape'
                        }
                    });
                }
            } else if (hoster.type === 'dood') {
                streamUrl = await extractDoodstream(hoster.url);
                if (streamUrl) {
                    streams.push({
                        name: '🇩🇪 Doodstream',
                        title: 'German - Doodstream',
                        url: streamUrl,
                        behaviorHints: {
                            bingeGroup: 'german-dood'
                        }
                    });
                }
            }
        }
        
        return streams;
    } catch (error) {
        console.error('Get streams error:', error.message);
        return [];
    }
}

// Main search function
async function searchGermanStreams(title, year, type, season, episode) {
    try {
        // Find the content page
        const contentUrl = await findContentPage(title, year, type);
        
        if (!contentUrl) {
            console.log('Content not found on hdfilme.to');
            return [];
        }
        
        // Get stream links from the content page
        const streams = await getStreamLinks(contentUrl, season, episode);
        
        return streams;
    } catch (error) {
        console.error('Search error:', error.message);
        return [];
    }
}

// Stream handler
builder.defineStreamHandler(async (args) => {
    console.log('Stream request:', args);
    
    const { type, id } = args;
    let streams = [];
    
    try {
        const imdbId = id.split(':')[0];
        
        // For series, parse season/episode
        let season, episode;
        if (type === 'series' && id.includes(':')) {
            const parts = id.split(':');
            season = parseInt(parts[1]);
            episode = parseInt(parts[2]);
        }
        
        // Get German title from TMDB
        const tmdbInfo = await getTMDBInfo(imdbId);
        const title = tmdbInfo ? (tmdbInfo.title || tmdbInfo.name) : '';
        const year = tmdbInfo ? (tmdbInfo.release_date || tmdbInfo.first_air_date || '').split('-')[0] : '';
        
        console.log(`Searching for: ${title} (${year}) ${season ? `S${season}E${episode}` : ''}`);
        
        if (!title) {
            throw new Error('Could not get title from TMDB');
        }
        
        // Search for German streams
        const germanStreams = await searchGermanStreams(title, year, type, season, episode);
        streams.push(...germanStreams);
        
        // Add fallback external links if no direct streams found
        if (streams.length === 0) {
            streams.push({
                name: '🔍 HDFilme.to',
                title: 'Auf HDFilme.to suchen',
                externalUrl: `${BASE_URL}/search?q=${encodeURIComponent(title)}`,
                behaviorHints: {
                    bingeGroup: 'german-external'
                }
            });
            
            streams.push({
                name: '💡 Tipp',
                title: 'Keine Streams gefunden - Versuche Torrentio mit Real-Debrid für deutsche Inhalte',
                externalUrl: 'https://torrentio.strem.fun/configure',
                behaviorHints: {
                    bingeGroup: 'info'
                }
            });
        }
        
    } catch (error) {
        console.error('Handler error:', error);
        streams.push({
            name: '❌ Fehler',
            title: `Error: ${error.message}`,
            externalUrl: `${BASE_URL}`,
            behaviorHints: {
                bingeGroup: 'error'
            }
        });
    }
    
    return Promise.resolve({ streams });
});

module.exports = builder.getInterface();
