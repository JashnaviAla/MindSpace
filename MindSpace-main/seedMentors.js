const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

const seedMentors = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const mentors = [
      { username: 'NGO_Mentor_1', password: 'changeme', role: 'mentor', anonymousId: 'mentor_' + Math.random().toString(36).substr(2, 9) },
      { username: 'Support_Counselor', password: 'changeme', role: 'mentor', anonymousId: 'mentor_' + Math.random().toString(36).substr(2, 9) }
    ];

    for (const m of mentors) {
      const exists = await User.findOne({ username: m.username });
      if (!exists) {
        await User.create(m);
        console.log(`Mentor ${m.username} created.`);
      }
    }

    console.log('Seeding complete.');
    process.exit(0);
  } catch (err) {
    console.error('Seeding failed:', err.message);
    process.exit(1);
  }
};

seedMentors();
