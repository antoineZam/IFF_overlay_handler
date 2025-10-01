const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const path = require('path');

// Set default connection key if not provided
const CONNECTION_KEY = process.env.CONNECTION_KEY || '1924d04e6aef4a4a79da39614c2080f7';
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

const dataFilePath = './source/data.json';

// Ensure the source directory exists
if (!fs.existsSync('./source')) {
  fs.mkdirSync('./source', { recursive: true });
}


function loadData() {
  try {
    const data = fs.readFileSync(dataFilePath, 'utf8');
    if (data.trim() === '') {
      throw new Error('File is empty');
    }
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading data:', error);
    const defaultData = {
      p1Flag: 'fr',
      p1Team: 'Team 1',
      p1Name: 'Player 1',
      p2Flag: 'rn',
      p2Team: 'Team 2',
      p2Name: 'Player 2',
      p1Score: 0,
      p2Score: 0,
      round: 'Winners Round 1',
      eventNumber: '1'
    };
    // Save default data to file
    saveData(defaultData);
    return defaultData;
  }
}

function saveData(data) {
  try {
    fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2));
    console.log('Data saved successfully to', dataFilePath);
  } catch (error) {
    console.error('Error saving data:', error);
  }
}


let overlayData = loadData();

// Authentication page
app.get('/auth', (req, res) => {
  res.sendFile(__dirname + '/auth.html');
});

// Handle authentication form submission
app.post('/auth', (req, res) => {
  const key = req.body.key;
  if (key === CONNECTION_KEY) {
    res.redirect(`/match-control?key=${key}`);
  } else {
    res.redirect('/auth?error=1');
  }
});

// Protected routes
app.get('/match-control', requireAuth, (req, res) => {
  res.sendFile(__dirname + '/match-control.html');
});

app.get('/match-overlay', requireAuth, (req, res) => {
  res.sendFile(__dirname + '/match-overlay.html');
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

  socket.emit('data-update', overlayData);

  socket.on('update-data', (data) => {
    overlayData = data;
    saveData(overlayData);
    
    io.emit('data-update', overlayData);
    console.log('Data updated:', overlayData);
  });

  socket.on('disconnect', () => {
    console.log('A user disconnected.');
  });
});

server.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
  console.log(`Open Control Panel at: http://localhost:${port}/match-control`);
  console.log(`Add Overlay to OBS from: http://localhost:${port}/match-overlay`);
});