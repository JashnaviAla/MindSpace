const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const connectDB = require('./config/db');
const apiRoutes = require('./routes/api');
const User = require('./models/User');
const Mood = require('./models/Mood');
const Message = require('./models/Message');
const ChatSession = require('./models/ChatSession');
const jwt = require('jsonwebtoken');

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
const onlineUsers = new Map(); // Store online user status

io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  // Status Tracking
  socket.on('register_user_status', (data) => {
    const { userId } = data;
    if (userId) {
      onlineUsers.set(userId, socket.id);
      io.emit('user_status_update', { userId, status: 'online' });
    }
  });

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

  socket.on('send_anon_msg', (data) => {
    const roomId = activeRooms[socket.id];
    if (roomId) {
      socket.to(roomId).emit('anon_message', { user: 'Stranger', text: data.text });
    }
  });

  // User manually hits 'Next' button
  socket.on('skip_partner', () => {
    const roomId = activeRooms[socket.id];
    if (roomId) endRoom(roomId);
  });

  socket.on('disconnect', () => {
    // Find if this socket belonged to a registered user
    for (const [uid, sid] of onlineUsers.entries()) {
      if (sid === socket.id) {
        onlineUsers.delete(uid);
        io.emit('user_status_update', { userId: uid, status: 'offline' });
        break;
      }
    }
    
    waitingQueue = waitingQueue.filter(id => id !== socket.id);
    const roomId = activeRooms[socket.id];
    if (roomId) endRoom(roomId);
  });

  // --- Community Features ---
  socket.on('send_community_post', (data) => {
    // Broadcast to everyone else
    socket.broadcast.emit('new_community_post', data);
  });

  // --- NGO Mentor / Admin Chat (Private 1-on-1) ---
  socket.on('join_mentor_chat', (data) => {
    const { userId, partnerId } = data;
    // Create a deterministic room ID for the pair
    const roomId = [userId, partnerId].sort().join('_');
    socket.join(roomId);
    console.log(`User ${userId} joined private room ${roomId} with ${partnerId}`);
  });

  socket.on('send_mentor_msg', async (data) => {
    const { senderId, receiverId, message } = data;
    const roomId = [senderId, receiverId].sort().join('_');

    try {
      const newMessage = new Message({ senderId, receiverId, message });
      await newMessage.save();
      
      // Broadcast to both in the room
      io.to(roomId).emit('new_mentor_msg', {
        senderId,
        receiverId,
        message,
        timestamp: newMessage.timestamp
      });
    } catch (err) {
      console.error('Error saving message:', err.message);
    }
  });

  // --- Support Queue (Standardized Events) ---
  socket.on('join_chat', (data) => {
    const { userId } = data;
    socket.join(userId);
    console.log(`User/Admin joined room: ${userId}`);
  });

  socket.on('send_message', async (data) => {
    const { userId, sender, text, isConsultant } = data;
    // Note: userId here is the 'target' room (the user's unique ID)
    const senderId = data.senderId; 
    const receiverId = data.receiverId;

    try {
      const newMessage = new Message({ 
        senderId, 
        receiverId, 
        message: text, 
        isConsultant: !!isConsultant 
      });
      await newMessage.save();

      // Create or Update ChatSession
      const targetUserId = userId; 
      let session = await ChatSession.findOne({ userId: targetUserId, status: 'active' });
      if (!session) {
        session = new ChatSession({ 
          userId: targetUserId, 
          lastMessage: text, 
          lastSender: isConsultant ? 'consultant' : 'user'
        });
      } else {
        session.lastMessage = text;
        session.lastSender = isConsultant ? 'consultant' : 'user';
        session.updatedAt = Date.now();
      }
      if (isConsultant) session.consultantId = senderId;
      await session.save();
      
      // Emit to everyone in the room
      io.to(userId).emit('receive_message', {
        senderId,
        receiverId,
        message: text,
        timestamp: newMessage.timestamp,
        isConsultant: !!isConsultant,
        senderType: isConsultant ? 'admin' : 'user'
      });

      // Broadcast queue update to all consultants
      if (!isConsultant) {
        socket.broadcast.emit('support_queue_update', { userId, message: text });
      }
    } catch (err) {
      console.error('Send Message Error:', err.message);
    }
  });

  socket.on('support_typing', (data) => {
    const { userId, isConsultant, partnerId } = data;
    // Both user and admin are now in room 'userId'
    const roomId = userId; 
    socket.to(roomId).emit('support_typing_status', { 
      isTyping: true, 
      senderId: isConsultant ? 'consultant' : userId 
    });
  });

  socket.on('support_stop_typing', (data) => {
    const { userId, isConsultant, partnerId } = data;
    const roomId = userId;
    socket.to(roomId).emit('support_typing_status', { isTyping: false });
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
