const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const connectDB = require('./config/db');
const apiRoutes = require('./routes/api');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Connect to MongoDB
connectDB().then(async () => {
  const User = require('./models/User');
  try {
    const adminExists = await User.findOne({ username: 'admin' });
    if (!adminExists) {
      await User.create({
        username: 'admin',
        password: 'changeme',
        role: 'admin',
        anonymousId: 'admin_sys_' + Math.random().toString(36).substr(2, 9),
        streakCount: 0
      });
      console.log('Default admin user created. username: admin, password: changeme');
    }
  } catch (err) {
    console.error('Failed to seed admin user:', err.message);
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Routes
app.use('/api', apiRoutes);

// Socket.io for Real-time Chat
// --- 1-on-1 Matchmaking Engine ---
let waitingQueue = []; 
const activeRooms = {}; 

io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  // Helper: tear down room and cleanly disconnect both parties from it
  const endRoom = (roomId) => {
    socket.to(roomId).emit('partner_left', { text: 'Stranger has disconnected.' });
    for (const [sId, rId] of Object.entries(activeRooms)) {
      if (rId === roomId) {
        const s = io.sockets.sockets.get(sId);
        if (s) s.leave(roomId);
        delete activeRooms[sId];
      }
    }
  };

  socket.on('find_match', () => {
    // Ensure not already in queue or room
    waitingQueue = waitingQueue.filter(id => id !== socket.id);
    if (activeRooms[socket.id]) return;

    if (waitingQueue.length > 0) {
      // Pull the longest waiting person
      const partnerId = waitingQueue.shift();
      const partnerSocket = io.sockets.sockets.get(partnerId);
      
      if (partnerSocket) {
        const roomHash = 'room_' + Math.random().toString(36).substr(2, 9);
        
        socket.join(roomHash);
        partnerSocket.join(roomHash);
        
        activeRooms[socket.id] = roomHash;
        activeRooms[partnerId] = roomHash;
        
        io.to(roomHash).emit('chat_start', { text: 'You are now connected with a random stranger!' });
      } else {
        waitingQueue.push(socket.id);
        socket.emit('waiting', { text: 'Waiting for a stranger...' });
      }
    } else {
      waitingQueue.push(socket.id);
      socket.emit('waiting', { text: 'Waiting for a stranger to connect...' });
    }
  });

  socket.on('send_message', (data) => {
    const roomId = activeRooms[socket.id];
    if (roomId) {
      socket.to(roomId).emit('message', { user: 'Stranger', text: data.text });
    }
  });

  // User manually hits 'Next' button
  socket.on('skip_partner', () => {
    const roomId = activeRooms[socket.id];
    if (roomId) endRoom(roomId);
  });

  socket.on('disconnect', () => {
    waitingQueue = waitingQueue.filter(id => id !== socket.id);
    const roomId = activeRooms[socket.id];
    if (roomId) endRoom(roomId);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Port ${PORT} is already in use.`);
    console.error(`   Run this command to fix it: taskkill /F /IM node.exe`);
    console.error(`   Then run: npm start\n`);
    process.exit(1);
  } else {
    throw err;
  }
});
