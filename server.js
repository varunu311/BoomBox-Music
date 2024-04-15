const WebSocket = require('ws');
const express = require('express');
const http = require('http');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const { PassThrough } = require('stream');

ffmpeg.setFfmpegPath('/usr/local/bin/ffmpeg/ffmpeg');

const app = express();
app.use(express.static('public'));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let allSockets = [];
let currentStream = null;

wss.on('connection', function connection(ws) {
    console.log('Client connected');
    allSockets.push(ws);

    ws.on('close', () => {
        allSockets = allSockets.filter(s => s !== ws);
        console.log('Client disconnected');
    });

    ws.on('message', async function incoming(message) {
        const data = JSON.parse(message);
        if (data.type === 'search') {
            const searchUrl = `https://musicapi.x007.workers.dev/search?q=${encodeURIComponent(data.songName)}&searchEngine=seevn`;
            try {
                const searchResponse = await axios.get(searchUrl);
                if (searchResponse.data && searchResponse.data.response.length > 0) {
                    const songId = searchResponse.data.response[0].id;
                    const fetchUrl = `https://musicapi.x007.workers.dev/fetch?id=${songId}`;

                    if (currentStream) {
                        currentStream.kill('SIGKILL');
                    }

                    const response = await axios({
                        url: fetchUrl,
                        method: 'GET',
                        responseType: 'stream'
                    });

                    currentStream = ffmpeg(response.data)
                        .audioCodec('pcm_s16le')
                        .toFormat('wav')
                        .on('error', (err) => {
                            console.error('Error during conversion:', err);
                        })
                        .on('end', () => {
                            allSockets.forEach(client => {
                                if (client.readyState === WebSocket.OPEN) {
                                    client.send(JSON.stringify({ type: 'EOF' }));
                                }
                            });
                        });

                    const passThrough = new PassThrough();
                    currentStream.pipe(passThrough);

                    const serverStartTime = Date.now();


                    passThrough.on('data', (chunk) => {
                        const currentTime = Date.now();
                        const elapsedTime = currentTime - serverStartTime;
                        const packetTimestamp = elapsedTime + 100; // Add a small offset (500 ms) to account for processing and network delays
                        allSockets.forEach(client => {
                            if (client.readyState === WebSocket.OPEN) {
                                client.send(JSON.stringify({
                                    type: 'audio',
                                    timestamp: packetTimestamp,
                                    chunk: chunk.toString('base64')
                                }), { binary: false });
                            }
                        });
                    });

                } else {
                    ws.send(JSON.stringify({ type: 'error', message: 'No results found' }));
                }
            } catch (error) {
                console.error('Error fetching song:', error);
                ws.send(JSON.stringify({ type: 'error', message: 'Failed to fetch song' }));
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT,() => {
    console.log(`Server running on http://localhost:${PORT}`);
});
