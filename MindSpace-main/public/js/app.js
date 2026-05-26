const API_URL = 'http://localhost:3000/api';

const initAuth = async () => {
  let anonymousId = localStorage.getItem('mindspace_anon_id');
  if (!anonymousId) {
    anonymousId = 'user_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('mindspace_anon_id', anonymousId);
  }

  try {
    const res = await fetch(`${API_URL}/user/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ anonymousId })
    });
    const user = await res.json();
    localStorage.setItem('mindspace_user', JSON.stringify(user));
    
    const streakEl = document.getElementById('streak-count');
    if (streakEl) streakEl.innerText = user.streakCount || 0;
    return user;
  } catch (err) {
    console.warn('Handling auth offline...', err);
    const cachedUser = JSON.parse(localStorage.getItem('mindspace_user'));
    if (cachedUser) {
      const streakEl = document.getElementById('streak-count');
      if (streakEl) streakEl.innerText = cachedUser.streakCount || 0;
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  initAuth();

  // Index Page Logic
  const moodBtns = document.querySelectorAll('.mood-btn');
  const moodNote = document.getElementById('mood-note');
  const submitMoodBtn = document.getElementById('submit-mood');
  const suggestionsBox = document.getElementById('suggestions-box');
  const suggestionsList = document.getElementById('suggestions-list');
  const chatBotResponseBox = document.getElementById('chatbot-response');

  let selectedEmoji = null;

  if (moodBtns.length > 0) {
    moodBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        moodBtns.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedEmoji = btn.dataset.emoji;
      });
    });

    submitMoodBtn.addEventListener('click', async () => {
      if (!selectedEmoji) {
        alert('Please select a mood first!');
        return;
      }

      const note = moodNote.value;
      const user = JSON.parse(localStorage.getItem('mindspace_user'));
      
      try {
        const res = await fetch(`${API_URL}/mood`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user ? user._id : null, emoji: selectedEmoji, note })
        });
        const data = await res.json();
        
        if (data.success) {
          suggestionsList.innerHTML = '';
          data.suggestions.forEach(sug => {
            const li = document.createElement('li');
            li.textContent = sug;
            suggestionsList.appendChild(li);
          });
          suggestionsBox.classList.remove('hidden');

          const chatRes = await fetch(`${API_URL}/chat`, {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ message: note || (selectedEmoji === '😭' ? 'sad' : 'happy') })
          });
          const chatData = await chatRes.json();
          chatBotResponseBox.innerText = chatData.text;

          submitMoodBtn.innerText = 'Saved!';
          moodNote.value = '';
          setTimeout(() => { submitMoodBtn.innerText = 'Log Mood'; }, 2000);
        }
      } catch (err) {
        console.warn('Offline mode saving', err);
        const offlineMoods = JSON.parse(localStorage.getItem('offline_moods') || '[]');
        offlineMoods.push({ emoji: selectedEmoji, note, date: new Date() });
        localStorage.setItem('offline_moods', JSON.stringify(offlineMoods));
        alert('You look to be offline. Saved your mood locally!');
      }
    });
  }
});
