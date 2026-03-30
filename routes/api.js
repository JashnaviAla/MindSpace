const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Mood = require('../models/Mood');
const Diary = require('../models/Diary');

// Helper to determine stress level from emoji
const getStressLevel = (emoji) => {
  const stressMap = {
    '\ud83d\ude0a': 1, '\ud83d\ude04': 1, // happy
    '\ud83d\ude10': 3, // neutral
    '\ud83d\ude14': 6, '\ud83d\ude22': 7, // sad
    '\ud83d\ude21': 8, '\ud83d\ude24': 8, // angry
    '\ud83d\ude1f': 8, // worried
    '\ud83d\ude2d': 10 // extremely sad/stressed
  };
  return stressMap[emoji] || 5;
};

// Helper for suggestions
const getSuggestions = (emoji) => {
  const stressLevel = getStressLevel(emoji);
  if (stressLevel >= 7) {
    return ['Try a 5-minute breathing exercise', 'Write in your diary', 'Listen to calming music, it really helps!'];
  } else if (stressLevel >= 4) {
    return ['Take a short walk', 'Drink some water', 'Chat with someone anonymously'];
  } else {
    return ['Keep up your great mood!', 'Log your good moments in the diary', 'Share your positivity in chat!'];
  }
};

// -- User Routes --
// Get or create anonymous user, and update streak
router.post('/user/login', async (req, res) => {
  try {
    const { anonymousId } = req.body;
    let user = await User.findOne({ anonymousId });

    const now = new Date();
    
    if (!user) {
      user = new User({ anonymousId, streakCount: 1, lastActiveDate: now, role: 'user' });
      await user.save();
    } else {
      // Check streak (if last active was yesterday, increment. If older, reset to 1)
      const lastActive = new Date(user.lastActiveDate);
      const diffTime = Math.abs(now - lastActive);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
      
      if (diffDays === 1 || (diffDays > 0 && lastActive.getDate() !== now.getDate())) {
        // Technically next day
        user.streakCount += 1;
      } else if (diffDays > 1) {
        user.streakCount = 1;
      }
      user.lastActiveDate = now;
      await user.save();
    }

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Register new user / Admin
router.post('/auth/register', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    const existing = await User.findOne({ username });
    if (existing) return res.status(400).json({ error: 'Username taken' });

    // Use username as anonymousId if not provided, or generate one
    const anonymousId = 'user_' + Math.random().toString(36).substr(2, 9);
    
    // In production, bcrypt password here. For this demo, we keep it simple.
    const user = new User({ username, password, role: role || 'user', anonymousId, streakCount: 1 });
    await user.save();
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login
router.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username, password });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    
    // Update streak logic
    const now = new Date();
    const lastActive = new Date(user.lastActiveDate || now);
    const diffTime = Math.abs(now - lastActive);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    
    if (diffDays === 1 || (diffDays > 0 && lastActive.getDate() !== now.getDate())) {
      user.streakCount += 1;
    } else if (diffDays > 1) {
      user.streakCount = 1;
    }
    user.lastActiveDate = now;
    await user.save();

    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reset Password
router.post('/auth/reset-password', async (req, res) => {
  try {
    const { username, newPassword } = req.body;
    if (!username || !newPassword) {
      return res.status(400).json({ error: 'Username and new password are required.' });
    }

    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ error: 'User not found.' });

    user.password = newPassword;
    await user.save();
    res.json({ success: true, message: 'Password updated successfully!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -- Mood Routes --
router.post('/mood', async (req, res) => {
  try {
    const { userId, emoji, note } = req.body;
    const mood = new Mood({
      userId,
      emoji,
      note,
      stressLevel: getStressLevel(emoji)
    });
    await mood.save();
    
    // Generate simple chatbot-like response / suggestion based on this mood
    const suggestions = getSuggestions(emoji);
    
    res.json({ success: true, mood, suggestions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/mood/:userId', async (req, res) => {
  try {
    const moods = await Mood.find({ userId: req.params.userId }).sort({ date: -1 });
    res.json(moods);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -- Diary Routes --
// Sync multiple entries from offline
router.post('/diary/sync', async (req, res) => {
  try {
    const { userId, entries } = req.body; // array of { title, content, date }
    
    // Save all to db
    const savedEntries = [];
    for (const entry of entries) {
      const newEntry = new Diary({
        userId,
        title: entry.title,
        content: entry.content,
        date: entry.date || new Date()
      });
      await newEntry.save();
      savedEntries.push(newEntry);
    }
    
    res.json({ success: true, count: savedEntries.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/diary/:userId', async (req, res) => {
  try {
    const diaries = await Diary.find({ userId: req.params.userId }).sort({ date: -1 });
    res.json(diaries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -- Chatbot API --
router.post('/chat', (req, res) => {
  const { message } = req.body;
  const lowerMsg = (message || '').toLowerCase();
  let responseText = "I'm here for you. Could you tell me more about how you're feeling?";
  
  if (lowerMsg.includes('sad') || lowerMsg.includes('depress') || lowerMsg.includes('cry')) {
    responseText = "I hear that you're feeling down. Remember that it's okay to not be okay. Maybe try writing down your feelings in the Diary, or use the Breathing Tool.";
  } else if (lowerMsg.includes('anxi') || lowerMsg.includes('stress') || lowerMsg.includes('overwhelm')) {
    responseText = "Stress can be overwhelming. Let's take a deep breath. Focus on inhaling for 4 seconds, and exhaling for 4 seconds. You've got this.";
  } else if (lowerMsg.includes('happy') || lowerMsg.includes('good') || lowerMsg.includes('great')) {
    responseText = "That's wonderful to hear! Keep up the positive energy and don't forget to keep your streak going.";
  } else if (lowerMsg.includes('hello') || lowerMsg.includes('hi')) {
    responseText = "Hello! I am MindSpace's bot. How are you feeling today?";
  }

  res.json({ text: responseText, user: 'Bot' });
});

// -- Admin/NGO Routes --
router.get('/admin/stats', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized. Admin token required.' });
    
    const tokenParts = authHeader.split(' ');
    if (tokenParts.length !== 2) return res.status(401).json({ error: 'Invalid token format.' });
    
    const userId = tokenParts[1];
    const user = await User.findById(userId);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden. Admins only.' });
    }

    const totalUsers = await User.countDocuments();
    const totalMoods = await Mood.countDocuments();
    
    // Calculate average stress level
    const agg = await Mood.aggregate([{ $group: { _id: null, avgStress: { $avg: '$stressLevel' } } }]);
    const avgStress = agg.length > 0 ? agg[0].avgStress : 0;
    
    // Get high stress alerts
    const alerts = await Mood.find({ stressLevel: { $gte: 8 } }).sort({ date: -1 }).limit(10).populate('userId', 'anonymousId');
    
    // Calculate Stress Distribution for Doughnut chart
    const stressDist = await Mood.aggregate([
      { $group: { _id: '$stressLevel', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    
    // Calculate Moods over time for Line chart
    const moodsTime = await Mood.aggregate([
      { 
        $group: { 
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } }, 
          count: { $sum: 1 },
          avgStress: { $avg: '$stressLevel' }
        } 
      },
      { $sort: { _id: 1 } },
      { $limit: 14 }
    ]);
    
    res.json({ 
      totalUsers, 
      totalMoods, 
      avgStress, 
      recentAlerts: alerts,
      stressDistribution: stressDist,
      moodsOverTime: moodsTime
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
