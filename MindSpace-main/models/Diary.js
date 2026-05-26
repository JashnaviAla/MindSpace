const mongoose = require('mongoose');

const DiarySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  title: { type: String, default: 'Untitled Entry' },
  content: { type: String, required: true },
  date: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Diary', DiarySchema);
