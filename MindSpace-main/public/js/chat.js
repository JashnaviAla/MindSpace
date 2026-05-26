document.addEventListener('DOMContentLoaded', () => {
  const socket = io();
  const user = JSON.parse(localStorage.getItem('mindspace_user')) || { anonymousId: 'anon_' + Math.random().toString(36).substr(2, 9), streakCount: 1 };
  
  // UI Elements - Tabs
  const tabFeed = document.getElementById('tab-feed');
  const tabMatch = document.getElementById('tab-match');
  const sectionFeed = document.getElementById('feed-section');
  const sectionMatch = document.getElementById('match-section');

  // UI Elements - Feed
  const feedContainer = document.getElementById('community-feed');
  const postInput = document.getElementById('post-input');
  const btnPost = document.getElementById('btn-post');
  const postTags = document.querySelectorAll('.tag-opt');
  const streakDisplay = document.getElementById('user-streak');

  // UI Elements - Match
  const chatWindow = document.getElementById('chat-window');
  const chatInput = document.getElementById('chat-input');
  const sendBtn = document.getElementById('send-chat');
  const statusBanner = document.getElementById('chat-status');
  const skipBtn = document.getElementById('skip-btn');

  let selectedTag = 'Vent';
  let isConnected = false;
  streakDisplay.innerText = user.streakCount || 1;

  // --- Tab Logic ---
  tabFeed.addEventListener('click', () => {
    tabFeed.classList.add('active');
    tabMatch.classList.remove('active');
    sectionFeed.style.display = 'block';
    sectionMatch.style.display = 'none';
  });

  tabMatch.addEventListener('click', () => {
    tabMatch.classList.add('active');
    tabFeed.classList.remove('active');
    sectionMatch.style.display = 'block';
    sectionFeed.style.display = 'none';
    
    // Auto-join matchmaking if not already connected
    if (!isConnected) {
      socket.emit('find_match');
    }
  });

  // --- Feed Logic ---
  postTags.forEach(tag => {
    tag.addEventListener('click', () => {
      postTags.forEach(t => t.classList.remove('selected'));
      tag.classList.add('selected');
      selectedTag = tag.getAttribute('data-tag');
    });
  });

  const fetchPosts = async () => {
    try {
      const res = await fetch('/api/community');
      const posts = await res.json();
      renderFeed(posts);
    } catch (err) {
      console.error('Failed to fetch posts:', err);
    }
  };

  const renderFeed = (posts) => {
    feedContainer.innerHTML = '';
    if (posts.length === 0) {
      feedContainer.innerHTML = '<div style="text-align: center; padding: 3rem; color: var(--text-light);">No thoughts shared yet. Be the first!</div>';
      return;
    }
    posts.forEach(post => {
      const card = createPostCard(post);
      feedContainer.appendChild(card);
    });
  };

  const createPostCard = (post) => {
    const div = document.createElement('div');
    div.className = 'post-card';
    div.id = `post-${post._id}`;
    
    const tagClass = `tag-${post.tag.toLowerCase().replace(' ', '-')}`;
    const isLiked = post.likes.includes(user.anonymousId);
    const dateStr = new Date(post.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    div.innerHTML = `
      <div class="post-header">
        <span class="post-tag ${tagClass}">#${post.tag}</span>
        <span class="post-time">${dateStr}</span>
      </div>
      <div class="post-text">${post.text}</div>
      <div class="post-footer">
        <button class="like-btn ${isLiked ? 'liked' : ''}" onclick="toggleLike('${post._id}')">
          ${isLiked ? '❤️' : '🤍'} <span class="like-count">${post.likes.length}</span>
        </button>
        <span style="font-size: 0.75rem; color: var(--text-light);">Anonymous Peer</span>
      </div>
    `;
    return div;
  };

  window.toggleLike = async (postId) => {
    try {
      const res = await fetch(`/api/community/like/${postId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anonymousId: user.anonymousId })
      });
      const data = await res.json();
      if (data.success) {
        const btn = document.querySelector(`#post-${postId} .like-btn`);
        const count = document.querySelector(`#post-${postId} .like-count`);
        btn.classList.toggle('liked', data.isLiked);
        btn.innerHTML = `${data.isLiked ? '❤️' : '🤍'} <span class="like-count">${data.likes}</span>`;
      }
    } catch (err) {
      console.error('Like failed:', err);
    }
  };

  btnPost.addEventListener('click', async () => {
    const text = postInput.value.trim();
    if (!text) return;

    btnPost.disabled = true;
    btnPost.innerText = 'Posting...';

    try {
      const res = await fetch('/api/community', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          anonymousId: user.anonymousId,
          text,
          tag: selectedTag
        })
      });
      const data = await res.json();
      if (data.success) {
        postInput.value = '';
        // Add to top of feed immediately
        const card = createPostCard(data.post);
        feedContainer.prepend(card);
        // Broadcast via socket
        socket.emit('send_community_post', data.post);
      }
    } catch (err) {
      console.error('Post failed:', err);
    } finally {
      btnPost.disabled = false;
      btnPost.innerText = 'Post Anonymously ✨';
    }
  });

  // Socket: Receive new community posts live
  socket.on('new_community_post', (post) => {
    const card = createPostCard(post);
    feedContainer.prepend(card);
  });

  // --- Match (1-on-1) Logic ---
  socket.on('waiting', (data) => {
    isConnected = false;
    statusBanner.style.background = 'rgba(255, 193, 7, 0.2)';
    statusBanner.style.color = '#b7791f';
    statusBanner.innerText = data.text;
    skipBtn.style.display = 'none';
    chatInput.disabled = true;
    chatWindow.innerHTML = ''; 
    appendMessage('System', data.text, true);
  });

  socket.on('chat_start', (data) => {
    isConnected = true;
    statusBanner.style.background = 'rgba(56, 178, 172, 0.1)';
    statusBanner.style.color = 'var(--accent)';
    statusBanner.innerHTML = '<span class="status-pulse" style="background: var(--success)"></span> Connected with Peer';
    skipBtn.style.display = 'block';
    chatInput.disabled = false;
    chatInput.focus();
    chatWindow.innerHTML = ''; 
    appendMessage('System', 'You are now connected with a random peer who cares. Say hi!', true);
  });

  socket.on('partner_left', (data) => {
    isConnected = false;
    appendMessage('System', 'Peer has disconnected.', true);
    statusBanner.style.background = 'rgba(217, 4, 41, 0.1)';
    statusBanner.style.color = '#d90429';
    statusBanner.innerText = 'Disengaged.';
    skipBtn.style.display = 'none';
    chatInput.disabled = true;
    setTimeout(() => { socket.emit('find_match'); }, 2000);
  });

  socket.on('anon_message', (data) => {
    appendMessage(data.user, data.text);
  });

  const appendMessage = (user, text, isSystem = false, isSelf = false) => {
    const div = document.createElement('div');
    if (isSystem) {
      div.className = 'text-muted';
      div.style.textAlign = 'center';
      div.style.fontSize = '0.85rem';
      div.style.margin = '1rem 0';
      div.innerText = text;
    } else {
      div.className = isSelf ? 'msg-bubble user-msg' : 'msg-bubble peer-msg';
      div.innerText = text;
    }
    chatWindow.appendChild(div);
    chatWindow.scrollTop = chatWindow.scrollHeight;
  };

  const sendMessage = () => {
    if (!isConnected) return;
    const text = chatInput.value.trim();
    if (text) {
      appendMessage('You', text, false, true);
      socket.emit('send_message', { text });
      chatInput.value = '';
    }
  };

  sendBtn.addEventListener('click', sendMessage);
  chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });
  skipBtn.addEventListener('click', () => {
    if (isConnected) {
      socket.emit('skip_partner');
      isConnected = false;
      socket.emit('find_match');
    }
  });

  // Initial load
  fetchPosts();
});
