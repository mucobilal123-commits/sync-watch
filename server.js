const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const { Server } = require('socket.io');

const PIN = process.env.PIN || '1234';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(16).toString('hex');
const PORT = process.env.PORT || 3000;

function signToken() {
  return crypto.createHmac('sha256', SESSION_SECRET).update('ok').digest('hex');
}
function checkToken(t) {
  return t && t === signToken();
}

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/login', (req, res) => {
  if ((req.body.pin || '').trim() === PIN) {
    res.cookie('auth', signToken(), { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 3600 * 1000 });
    return res.redirect('/');
  }
  res.redirect('/login?err=1');
});

app.post('/logout', (req, res) => {
  res.clearCookie('auth');
  res.redirect('/login');
});

function auth(req, res, next) {
  if (checkToken(req.cookies.auth)) return next();
  res.redirect('/login');
}

app.get('/', auth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'app.html'));
});

const server = http.createServer(app);
const io = new Server(server);

io.use((socket, next) => {
  const cookie = socket.handshake.headers.cookie || '';
  const m = cookie.match(/auth=([^;]+)/);
  if (m && checkToken(decodeURIComponent(m[1]))) return next();
  next(new Error('unauthorized'));
});

const state = {
  url: '',
  isPlaying: false,
  currentTime: 0,
  updatedAt: Date.now(),
};

function liveTime() {
  if (!state.isPlaying) return state.currentTime;
  return state.currentTime + (Date.now() - state.updatedAt) / 1000;
}

function snapshot() {
  return {
    url: state.url,
    isPlaying: state.isPlaying,
    currentTime: liveTime(),
    serverTime: Date.now(),
  };
}

io.on('connection', (socket) => {
  socket.emit('state', snapshot());
  io.emit('users', io.engine.clientsCount);

  socket.on('setUrl', (url) => {
    if (typeof url !== 'string' || url.length > 2000) return;
    state.url = url;
    state.currentTime = 0;
    state.isPlaying = false;
    state.updatedAt = Date.now();
    io.emit('state', snapshot());
  });

  socket.on('play', (t) => {
    state.currentTime = Number(t) || 0;
    state.isPlaying = true;
    state.updatedAt = Date.now();
    io.emit('state', snapshot());
  });

  socket.on('pause', (t) => {
    state.currentTime = Number(t) || 0;
    state.isPlaying = false;
    state.updatedAt = Date.now();
    io.emit('state', snapshot());
  });

  socket.on('seek', (t) => {
    state.currentTime = Number(t) || 0;
    state.updatedAt = Date.now();
    io.emit('state', snapshot());
  });

  socket.on('ping', (cb) => { if (typeof cb === 'function') cb(Date.now()); });

  socket.on('disconnect', () => {
    io.emit('users', io.engine.clientsCount);
  });
});

server.listen(PORT, () => {
  console.log('sync-watch http://localhost:' + PORT + '  PIN=' + PIN);
});
