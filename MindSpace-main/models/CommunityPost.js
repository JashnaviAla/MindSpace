const mongoose = require('mongoose');

const communityPostSchema = new mongoose.Schema({
  anonymousId: {
    type: String,
    required: true
  },
  text: {
    type: String,
    required: true,
    trim: true
  },
  tag: {
    type: String,
    enum: ['Feeling Down', 'Feeling Great', 'Seeking Advice', 'Vent', 'Small Win', 'Motivation'],
    default: 'Vent'
  },
  likes: {
    type: [String], // Array of anonymous IDs or User IDs who liked
    default: []
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('CommunityPost', communityPostSchema);
