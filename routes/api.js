const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Mood = require('../models/Mood');
const Diary = require('../models/Diary');
const { GoogleGenAI } = require('@google/genai');

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
// Get or create anonymous user, update day streak on visit
router.post('/user/login', async (req, res) => {
  try {
    const { anonymousId } = req.body;
    let user = await User.findOne({ anonymousId });

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (!user) {
      user = new User({ anonymousId, streakCount: 1, lastActiveDate: today, role: 'user' });
      await user.save();
    } else {
      const lastActive = user.lastActiveDate ? new Date(user.lastActiveDate) : null;
      const lastDay = lastActive ? new Date(lastActive.getFullYear(), lastActive.getMonth(), lastActive.getDate()) : null;

      if (!lastDay) {
        // First time ever
        user.streakCount = 1;
      } else {
        const diffDays = Math.round((today - lastDay) / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) {
          // Same day, streak stays
        } else if (diffDays === 1) {
          // Consecutive day, increment
          user.streakCount += 1;
        } else {
          // Missed a day (diffDays > 1), reset to 1 (they're using it now)
          user.streakCount = 1;
        }
      }
      
      user.lastActiveDate = today;
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
    
    // Update streak in database
    if (userId) {
      const user = await User.findById(userId);
      if (user) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const lastActive = user.lastActiveDate ? new Date(user.lastActiveDate) : null;
        const lastDay = lastActive ? new Date(lastActive.getFullYear(), lastActive.getMonth(), lastActive.getDate()) : null;
        
        const diffMs = lastDay ? (today - lastDay) : null;
        const diffDays = diffMs !== null ? Math.round(diffMs / (1000 * 60 * 60 * 24)) : null;
        
        if (diffDays === null) {
          user.streakCount = 1; // first ever mood
        } else if (diffDays === 0) {
          // same day, streak stays the same
        } else if (diffDays === 1) {
          user.streakCount += 1; // consecutive day
        } else {
          // missed a day (diffDays > 1), streak was 0, now using again = 1
          user.streakCount = 1;
        }
        
        user.lastActiveDate = now;
        await user.save();
      }
    }
    
    // Generate simple chatbot-like response / suggestion based on this mood
    const suggestions = getSuggestions(emoji);
    
    // Return updated user streak
    const updatedUser = userId ? await User.findById(userId) : null;
    
    res.json({ success: true, mood, suggestions, streak: updatedUser ? updatedUser.streakCount : 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get moods for calendar view
router.get('/mood/calendar/:userId', async (req, res) => {
  try {
    const moods = await Mood.find({ userId: req.params.userId })
      .select('emoji date stressLevel')
      .sort({ date: -1 })
      .limit(90); // last 90 days max
    res.json(moods);
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

// -- Chatbot API (Gemini 2.5 Flash) --
router.post('/chat', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ text: 'Message cannot be empty.' });

    const apiKey = process.env.GEMINI_API_KEY;

    // Fallback: if no API key, use keyword-based responses
    if (!apiKey) {
      const lowerMsg = message.toLowerCase();
      let responseText = "I'm here for you. Could you tell me more about how you're feeling?";
      if (lowerMsg.includes('sad') || lowerMsg.includes('depress') || lowerMsg.includes('cry')) {
        responseText = "I hear that you're feeling down. It's okay to not be okay. Try writing in your Diary or using the Relax breathing tool.";
      } else if (lowerMsg.includes('anxi') || lowerMsg.includes('stress') || lowerMsg.includes('overwhelm')) {
        responseText = "Stress can be tough. Let's take a deep breath together — try the Relax section for a guided exercise.";
      } else if (lowerMsg.includes('happy') || lowerMsg.includes('good') || lowerMsg.includes('great')) {
        responseText = "That's wonderful! Keep up the positive energy and don't forget to log your streak today.";
      } else if (lowerMsg.includes('hello') || lowerMsg.includes('hi')) {
        responseText = "Hi! I'm your MindSpace Guide. How are you feeling today?";
      }
      return res.json({ text: responseText, user: 'Bot' });
    }

    // AI-Powered response using Gemini 2.5 Flash (lazy init to avoid startup crash)
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: message,
      config: {
        systemInstruction: "You are the 'MindSpace Guide', a supportive, empathetic, and warm mental health companion for a youth mental health platform. " +
          "Provide a safe, non-judgmental space. Suggest platform features (Diary, Relax Breathing, Mood Tracker, Heal Sanctuary) when helpful. " +
          "Always remind users you are an AI and suggest professional help for severe distress. Keep responses under 3-4 sentences."
      }
    });

    res.json({ text: response.text, user: 'Bot' });
  } catch (err) {
    console.error('Gemini API Error:', err.message);
    res.json({ text: "I'm here for you, but I'm having a moment. How are you feeling?", user: 'Bot' });
  }
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
