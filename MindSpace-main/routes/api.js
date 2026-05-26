const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Mood = require('../models/Mood');
const CommunityPost = require('../models/CommunityPost');
const Message = require('../models/Message');
const ChatSession = require('../models/ChatSession');
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

// Analyze diary content with AI
router.post('/diary/analyze', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Diary content is required for analysis.' });

    const apiKey = process.env.GEMINI_API_KEY;

    // Fallback: simple mood detector if no API key
    if (!apiKey) {
      const lower = text.toLowerCase();
      let mood = 'Thoughtful';
      let tip = 'Continue reflecting on your journey.';
      
      if (lower.match(/sad|lonely|hurt|bad|depress/)) {
        mood = 'Heavier Emotions Detected';
        tip = 'Be extra kind to yourself today. Try a 5-minute breathing exercise in the Relax section.';
      } else if (lower.match(/happy|great|good|win|proud/)) {
        mood = 'Positive Growth';
        tip = 'Keep this momentum going! Log a small win in your diary to celebrate.';
      }

      return res.json({ 
        analysis: `Mood: ${mood}. ${tip}`,
        user: 'Assistant' 
      });
    }

    // AI-Powered Reflection Assistant
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.1-flash',
      contents: text,
      config: {
        systemInstruction: "You are the 'MindSpace Reflection Assistant'. Analyze this diary entry for emotional tone, key themes, and provide 2-3 gentle, supportive insights or actionable wellness steps. Maintain a warm, encouraging, and non-prescriptive tone. Keep it concise (3-4 sentences max)."
      }
    });

    res.json({ analysis: response.text, user: 'Assistant' });
  } catch (err) {
    console.error('Gemini Analysis Error:', err.message);
    res.json({ analysis: "Your reflection is a powerful step. Take a deep breath and stay present with yourself.", user: 'Assistant' });
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

      // Helper: pick a random response from an array
      const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

      const negativeResponses = [
        "I'm sorry you're feeling this way 💙 Remember, even the darkest nights end with sunrise. Try writing in your Diary — it can really help.",
        "It's okay to not be okay. Every storm runs out of rain 🌧️ Visit the Heal Sanctuary and give yourself some peace.",
        "I hear you, and your feelings are completely valid. You are stronger than you feel right now. Take it one breath at a time 🌿",
        "Hard days remind us that we're human. You don't have to have it all together — just take the next small step 💪",
        "Sending you warmth 💙 When things feel heavy, try the Relax breathing tool. Even 2 minutes can shift your mindset.",
        "You matter more than you know. Even when it doesn't feel that way, brighter days are always ahead. I'm here with you 🌱",
      ];

      const anxietyResponses = [
        "It's okay to feel overwhelmed sometimes 🌿 Breathe in for 4 seconds, hold for 4, out for 4. Try the Relax section — it really helps.",
        "Anxiety is your mind trying to protect you. Ground yourself — name 5 things you can see right now 👀 You've got this.",
        "Stress is temporary. Close your eyes, take 3 deep breaths, and remind yourself: you have overcome hard things before 💪",
        "When everything feels too much, focus on just this moment. Try the Heal Sanctuary for a calming session 🧘",
        "You don't have to solve everything at once. Break it into one tiny step. What's the smallest thing you can do right now? 🌱",
      ];

      const positiveResponses = [
        "That's amazing to hear! 🌟 Your positive energy is contagious — keep riding that wave!",
        "Love to see it! 🎉 Don't forget to log your mood today and keep your streak alive!",
        "You're glowing! ✨ Moments like these are worth capturing — try writing about it in your Diary.",
        "Wonderful! You deserve every bit of this happiness 😊 Keep nurturing this energy!",
        "That's the spirit! 🚀 Stay consistent, log your mood, and keep building those healthy habits!",
      ];

      const goodResponses = [
        "Glad to hear things are going well 😊 Keep checking in with your Mood Tracker!",
        "That's great! Small wins add up 🌱 Don't forget to keep your daily streak going!",
        "Good vibes incoming! ✨ Make sure to log today's mood and celebrate the little things.",
        "Consistency is key! 🔥 You're building a great habit — keep it up!",
      ];

      const greetingResponses = [
        "Hi there! 🌱 I'm your MindSpace Guide. How are you feeling today?",
        "Hello! 🌿 I'm here to support you. What's on your mind?",
        "Hey! Welcome back 💙 How has your day been treating you?",
        "Hi! It's good to see you here. Tell me — how are you feeling right now?",
      ];

      let responseText = pick([
        "I'm here for you 🌿 Could you tell me a little more about how you're feeling?",
        "I'm listening. What's on your mind today? 💙",
        "Take your time — I'm here for whatever you want to share 🌱",
      ]);

      if (
        lowerMsg.includes('unhappy') || lowerMsg.includes('sad') ||
        lowerMsg.includes('depress') || lowerMsg.includes('cry') ||
        lowerMsg.includes('not okay') || lowerMsg.includes('bad') ||
        lowerMsg.includes('hurt') || lowerMsg.includes('lonely') ||
        lowerMsg.includes('tired') || lowerMsg.includes('hopeless') ||
        lowerMsg.includes('miss') || lowerMsg.includes('upset')
      ) {
        responseText = pick(negativeResponses);
      } else if (
        lowerMsg.includes('anxi') || lowerMsg.includes('stress') ||
        lowerMsg.includes('overwhelm') || lowerMsg.includes('worried') ||
        lowerMsg.includes('scared') || lowerMsg.includes('panic')
      ) {
        responseText = pick(anxietyResponses);
      } else if (
        (lowerMsg.includes('happy') && !lowerMsg.includes('unhappy')) ||
        lowerMsg.includes('great') || lowerMsg.includes('amazing') ||
        lowerMsg.includes('wonderful') || lowerMsg.includes('fantastic') ||
        lowerMsg.includes('excited') || lowerMsg.includes('joyful')
      ) {
        responseText = pick(positiveResponses);
      } else if (
        lowerMsg.includes('good') && !lowerMsg.includes('not good') &&
        !lowerMsg.includes('no good')
      ) {
        responseText = pick(goodResponses);
      } else if (
        lowerMsg.includes('hello') || lowerMsg.includes('hi') ||
        lowerMsg.includes('hey') || lowerMsg.includes('howdy')
      ) {
        responseText = pick(greetingResponses);
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

// -- Admin: Get User List --
router.get('/admin/users', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized.' });
    const userId = authHeader.split(' ')[1];
    const admin = await User.findById(userId);
    if (!admin || admin.role !== 'admin') return res.status(403).json({ error: 'Forbidden.' });

    const users = await User.find({}, 'anonymousId streakCount lastActiveDate role createdAt')
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


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

// -- Community Routes --
// Get recent community posts
router.get('/community', async (req, res) => {
  try {
    const posts = await CommunityPost.find().sort({ createdAt: -1 }).limit(50);
    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a new community post
router.post('/community', async (req, res) => {
  try {
    const { anonymousId, text, tag } = req.body;
    if (!text) return res.status(400).json({ error: 'Post text is required.' });

    const newPost = new CommunityPost({
      anonymousId,
      text,
      tag: tag || 'Vent'
    });
    await newPost.save();

    res.json({ success: true, post: newPost });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle like on a community post
router.post('/community/like/:postId', async (req, res) => {
  try {
    const { anonymousId } = req.body;
    const { postId } = req.params;

    const post = await CommunityPost.findById(postId);
    if (!post) return res.status(404).json({ error: 'Post not found.' });

    const index = post.likes.indexOf(anonymousId);
    if (index === -1) {
      post.likes.push(anonymousId);
    } else {
      post.likes.splice(index, 1);
    }

    await post.save();
    res.json({ success: true, likes: post.likes.length, isLiked: index === -1 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -- Chat Routes --
// Get list of mentors and admins
router.get('/chat/mentors', async (req, res) => {
  try {
    const mentors = await User.find({ role: { $in: ['admin', 'mentor'] } }, 'username anonymousId role');
    res.json(mentors);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -- NGO Consultant Side --
// Get all active support sessions for the NGO dashboard
router.get('/chat/active-sessions', async (req, res) => {
  try {
    const activeSessions = await ChatSession.find({ status: 'active' })
                                           .sort({ updatedAt: -1 })
                                           .populate('userId', 'username anonymousId');

    // Fetch latest mood for each session for prioritization
    const queue = [];
    for (const session of activeSessions) {
      if (!session.userId) continue;
      const latestMood = await Mood.findOne({ userId: session.userId._id }).sort({ date: -1 });
      queue.push({
        sessionId: session._id,
        userId: session.userId._id,
        username: session.userId.username || session.userId.anonymousId,
        lastMessage: session.lastMessage,
        lastSender: session.lastSender,
        updatedAt: session.updatedAt,
        stressLevel: latestMood ? latestMood.stressLevel : 0,
        isPriority: latestMood ? latestMood.stressLevel >= 8 : false
      });
    }

    res.json(queue);
  } catch (err) {
    res.status(500).send("Error fetching chats");
  }
});

// Resolve a support session
router.post('/chat/resolve', async (req, res) => {
  try {
    const { sessionId } = req.body;
    await ChatSession.findByIdAndUpdate(sessionId, { status: 'resolved' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).send("Error resolving session");
  }
});

// Get chat history with a specific partner
router.get('/chat/history/:userId/:partnerId', async (req, res) => {
  try {
    const { userId, partnerId } = req.params;
    
    // If partnerId is 'consultant_pool', get ALL messages where this user is sender or receiver with any admin/mentor
    let query;
    if (partnerId === 'consultant_pool') {
      const mentors = await User.find({ role: { $in: ['admin', 'mentor'] } }).distinct('_id');
      query = {
        $or: [
          { senderId: userId, receiverId: { $in: mentors } },
          { senderId: { $in: mentors }, receiverId: userId }
        ]
      };
    } else {
      query = {
        $or: [
          { senderId: userId, receiverId: partnerId },
          { senderId: partnerId, receiverId: userId }
        ]
      };
    }

    const history = await Message.find(query).sort({ timestamp: 1 });
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
