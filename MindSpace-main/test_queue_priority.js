const mongoose = require('mongoose');
const User = require('./models/User');
const Mood = require('./models/Mood');
const Message = require('./models/Message');
require('dotenv').config();

const testPriority = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    
    // 1. Create a High Stress User
    const userHigh = await User.create({ anonymousId: 'high_stress_user', role: 'user' });
    await Mood.create({ userId: userHigh._id, emoji: '😭', stressLevel: 9, note: 'Very stressed' });
    await Message.create({ senderId: userHigh._id, receiverId: '600000000000000000000001', message: 'HELP!' });

    // 2. Create a Low Stress User (sent message more recently, but lower stress)
    const userLow = await User.create({ anonymousId: 'low_stress_user', role: 'user' });
    await Mood.create({ userId: userLow._id, emoji: '😊', stressLevel: 2 });
    await Message.create({ senderId: userLow._id, receiverId: '600000000000000000000001', message: 'Just saying hi' });

    console.log('Test data created. High stress user sent FIRST, but should be at the TOP.');
    process.exit(0);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
};

testPriority();
