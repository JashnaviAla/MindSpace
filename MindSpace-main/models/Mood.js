const mongoose = require('mongoose');

const MoodSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  emoji: { type: String, required: true },
  note: { type: String },
  date: { type: Date, default: Date.now },
  stressLevel: { type: Number, default: 0 } // 1-10 mapped from emoji
});

module.exports = mongoose.model('Mood', MoodSchema);
