const WebSocket = require('ws');
const Speaker = require('lfd-speaker');
const { Readable } = require('stream');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const ws = new WebSocket('ws:107.20.102.99:3000');

const speaker = new Speaker({
  channels: 2,
  bitDepth: 16,
  sampleRate: 44100
});

const stream = new Readable({
  read() {}
});

stream.pipe(speaker);

ws.on('open', function() {
  console.log('Connected to server');
  promptForSong();
});

function promptForSong() {
  rl.question('Song Name: ', (songName) => {
    if (songName.toLowerCase() === 'exit') { 
      rl.close();
      ws.close();
    } else {
      ws.send(JSON.stringify({ type: 'search', songName: songName }));
    }
  });
}

ws.on('message', function incoming(message) {
  const data = JSON.parse(message);
  if (data.type === 'EOF') {
      promptForSong();
  } else if (data.type === 'audio') {
      const currentTime = Date.now();
      const delay = data.timestamp - currentTime;
      setTimeout(() => {
          stream.push(Buffer.from(data.chunk, 'base64'));
      }, delay > 0 ? delay : 0);
  }
});

ws.on('error', function error(err) {
  console.error('WebSocket Error:', err);
});

rl.on('close', () => {
  ws.close();
});
