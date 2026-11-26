const fs = require('fs');
const path = require('path');
const https = require('https');

const BIN = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
const DEST = path.join(__dirname, BIN);
const URL = process.platform === 'win32'
  ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
  : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux';

if (fs.existsSync(DEST)) {
  console.log('yt-dlp already present');
  process.exit(0);
}

function get(url, file, cb) {
  https.get(url, (res) => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      return get(res.headers.location, file, cb);
    }
    if (res.statusCode !== 200) return cb(new Error('HTTP ' + res.statusCode));
    res.pipe(file);
    file.on('finish', () => file.close(cb));
  }).on('error', cb);
}

console.log('downloading yt-dlp...');
const file = fs.createWriteStream(DEST);
get(URL, file, (err) => {
  if (err) { console.error('yt-dlp download failed:', err.message); process.exit(0); }
  if (process.platform !== 'win32') fs.chmodSync(DEST, 0o755);
  console.log('yt-dlp ready');
});
