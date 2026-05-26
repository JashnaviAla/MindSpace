const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  anonymousId: { type: String, required: true, unique: true },
  username: { type: String, unique: true, sparse: true },
  password: { type: String },
  streakCount: { type: Number, default: 0 },
  lastActiveDate: { type: Date, default: Date.now },
  role: { type: String, enum: ['user', 'admin', 'mentor'], default: 'user' }
});

module.exports = mongoose.model('User', UserSchema);
