const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const path = require('path');

// Set default connection key if not provided
const CONNECTION_KEY = process.env.CONNECTION_KEY;
console.log('Connection key:', CONNECTION_KEY);

const port = 3000;
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files from the 'source' directory
app.use('/source', express.static(path.join(__dirname, 'source')));

// Middleware to parse JSON and URL-encoded data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Authentication middleware for web pages
function requireAuth(req, res, next) {
  const authKey = req.query.key || req.body.key;
  if (authKey === CONNECTION_KEY) {
    next();
  } else {
    res.redirect('/auth');
  }
}

const rematchDataFilePath = './source/rematch-data.json';
const finalsDataFilePath = './source/finals-data.json';

// Ensure the source directory exists
if (!fs.existsSync('./source')) {
  fs.mkdirSync('./source', { recursive: true });
}


function loadData(filePath) {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    if (data.trim() === '') {
      throw new Error('File is empty');
    }
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error loading data from ${filePath}:`, error);
    const defaultData = {
      p1Flag: 'fr',
      p1Ranking: '#1',
      p1Name: 'Player 1',
      p2Flag: 'rn',
      p2Ranking: '#2',
      p2Name: 'Player 2',
      p1Score: 0,
      p2Score: 0,
      round: 'Winners Round 1'
    };
    // Save default data to file
    saveData(filePath, defaultData);
    return defaultData;
  }
}

function saveData(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log('Data saved successfully to', filePath);
  } catch (error) {
    console.error(`Error saving data to ${filePath}:`, error);
  }
}


let rematchData = loadData(rematchDataFilePath);
let finalsData = loadData(finalsDataFilePath);

// Authentication page
app.get('/auth', (req, res) => {
  res.sendFile(__dirname + '/auth.html');
});

// Handle authentication form submission
app.post('/auth', (req, res) => {
  const key = req.body.key;
  if (key === CONNECTION_KEY) {
    res.redirect(`/rematch-overlay?key=${key}`);
  } else {
    res.redirect('/auth?error=1');
  }
});

// Protected routes
app.get('/rematch-control', requireAuth, (req, res) => {
  res.sendFile(__dirname + '/rematch-control.html');
});

app.get('/rematch-overlay', requireAuth, (req, res) => {
  res.sendFile(__dirname + '/rematch-overlay.html');
});

app.get('/finals-control', requireAuth, (req, res) => {
  res.sendFile(__dirname + '/finals-control.html');
});

app.get('/finals-overlay', requireAuth, (req, res) => {
  res.sendFile(__dirname + '/finals-overlay.html');
});

// Redirect root to auth
app.get('/', (req, res) => {
  res.redirect('/auth');
});

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (token !== CONNECTION_KEY) {
    next(new Error('Invalid connection key'));
  } else {
    next();
  }
});

io.on('connection', (socket) => {
  console.log('A user connected successfully.');

  const referer = socket.handshake.headers.referer || '';
  let room;
  let data;
  let dataFilePath;

  if (referer.includes('/rematch-')) {
    room = 'rematch';
    data = rematchData;
    dataFilePath = rematchDataFilePath;
  } else if (referer.includes('/finals-')) {
    room = 'finals';
    data = finalsData;
    dataFilePath = finalsDataFilePath;
  } else {
    console.error('Could not determine room from referer:', referer);
    return socket.disconnect(true);
  }

  socket.join(room);
  console.log(`A user joined room: ${room}`);

  socket.emit('data-update', data);

  socket.on('update-data', (updatedData) => {
    if (room === 'rematch') {
      rematchData = updatedData;
    } else { // if (room === 'finals')
      finalsData = updatedData;
    }
    saveData(dataFilePath, updatedData);
    
    io.to(room).emit('data-update', updatedData);
    console.log(`Data updated for ${room}:`, updatedData);
  });

  socket.on('disconnect', () => {
    console.log('A user disconnected.');
  });
});

server.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
  console.log(`Open Finals Control Panel at: http://localhost:${port}/finals-control`);
  console.log(`Add Finals Overlay to OBS from: http://localhost:${port}/finals-overlay`);
  console.log(`Open Rematch Control Panel at: http://localhost:${port}/rematch-control`);
  console.log(`Add Rematch Overlay to OBS from: http://localhost:${port}/rematch-overlay`);
});