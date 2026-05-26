function injectMsg(text) {
  const input = document.getElementById('chat-input');
  input.value = text;
  input.focus();
}

document.addEventListener('DOMContentLoaded', async () => {
  const socket = io();
  const token = localStorage.getItem('admin_token');
  const user = JSON.parse(localStorage.getItem('mindspace_user'));

  if (!token || !user) {
    window.location.href = 'admin-login.html';
    return;
  }

  const activeChatsList = document.getElementById('active-chats-list');
  const chatActiveWindow = document.getElementById('chat-active-window');
  const noChatSelected = document.getElementById('no-chat-selected');
  const messagesContainer = document.getElementById('messages-container');
  const chatInput = document.getElementById('chat-input');
  const sendBtn = document.getElementById('btn-send');
  const resolveBtn = document.getElementById('btn-resolve');

  let activeSessionId = null;
  let activePartnerId = null;
  let sessions = [];

  // --- 1. Fetch Sessions (Queue) ---
  const fetchSessions = async () => {
    try {
      const res = await fetch('/api/chat/active-sessions', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      sessions = await res.json();
      renderQueue();
    } catch (err) {
      console.error('Session fetch error:', err);
    }
  };

  const renderQueue = () => {
    activeChatsList.innerHTML = '';
    if (sessions.length === 0) {
      activeChatsList.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--muted);">No active sessions.</div>';
      return;
    }

    sessions.forEach(session => {
      const div = document.createElement('div');
      
      // Urgency Logic: Check if last message was from user AND more than 2 mins ago
      const lastUpdate = new Date(session.updatedAt);
      const diffMins = (new Date() - lastUpdate) / 60000;
      const isUrgent = diffMins >= 2 && session.lastSender === 'user';
      
      div.className = `chat-item ${activeSessionId === session.sessionId ? 'active' : ''} ${isUrgent ? 'urgent' : ''}`;
      
      div.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: baseline;">
          <span style="font-weight: 700;">${session.username}</span>
          <span class="wait-timer">${Math.floor(diffMins)}m ago</span>
        </div>
        <div class="text-muted" style="font-size: 0.8rem; margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          ${session.lastMessage || 'Starting session...'}
        </div>
        ${session.isPriority ? '<div style="font-size: 0.6rem; color: #ef4444; font-weight: 800; text-transform: uppercase; margin-top: 5px;">🚨 High Priority</div>' : ''}
      `;

      div.onclick = () => selectSession(session);
      activeChatsList.appendChild(div);
    });
  };

  // --- 2. Select Session Logic ---
  const selectSession = async (session) => {
    activeSessionId = session.sessionId;
    activePartnerId = session.userId;
    noChatSelected.style.display = 'none';
    chatActiveWindow.style.display = 'flex';

    document.getElementById('active-user-title').innerText = session.username;
    
    // Update Context Panel
    document.getElementById('panel-username').innerText = session.username;
    document.getElementById('panel-id').innerText = `ID: ${session.userId.substring(0, 8)}...`;
    
    const stressFill = document.getElementById('panel-stress-fill');
    stressFill.style.width = `${session.stressLevel * 10}%`;
    stressFill.style.background = session.stressLevel >= 8 ? '#ef4444' : 'var(--primary)';
    document.getElementById('panel-stress-text').innerText = `${session.stressLevel}/10 (${session.isPriority ? 'High Care' : 'Stable'})`;
    
    const sessionDuration = Math.round((new Date() - new Date(session.updatedAt)) / 60000); // simplified logic
    document.getElementById('panel-duration').innerText = `${sessionDuration}m`;

    // Socket: Join private support room
    socket.emit('join_support_session', { userId: session.userId });

    // History
    await fetchHistory(session.userId);
    renderQueue();
  };

  const fetchHistory = async (userId) => {
    try {
      const res = await fetch(`/api/chat/history/${userId}/consultant_pool`);
      const history = await res.json();
      messagesContainer.innerHTML = '';
      history.forEach(msg => appendMessage(msg));
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    } catch (err) {
      console.error('History error:', err);
    }
  };

  const appendMessage = (data) => {
    // Clear typing indicator
    const el = document.getElementById('typing-indicator');
    if (el) el.remove();

    const isSelf = data.senderId === user._id;
    const div = document.createElement('div');
    div.className = `bubble ${isSelf ? 'sent' : 'received'}`;
    
    const time = new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    div.innerHTML = `
      <div>${data.message}</div>
      <div style="font-size: 0.6rem; opacity: 0.6; margin-top: 4px; text-align: ${isSelf ? 'right' : 'left'}">${time}</div>
    `;
    
    messagesContainer.appendChild(div);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  };

  // --- 3. Interaction Logic ---
  let typingTimeout;
  chatInput.oninput = () => {
    socket.emit('support_typing', { userId: user._id, isConsultant: true, partnerId: activePartnerId });
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      socket.emit('support_stop_typing', { userId: user._id, isConsultant: true, partnerId: activePartnerId });
    }, 2000);
  };

  const sendMessage = () => {
    const msg = chatInput.value.trim();
    if (!msg || !activePartnerId) return;

    socket.emit('send_support_msg', {
      senderId: user._id,
      receiverId: activePartnerId,
      message: msg,
      isConsultant: true
    });

    chatInput.value = '';
    chatInput.focus();
  };

  sendBtn.onclick = sendMessage;
  chatInput.onkeypress = (e) => { if (e.key === 'Enter') sendMessage(); };

  resolveBtn.onclick = async () => {
    if (!activeSessionId) return;
    try {
      await fetch('/api/chat/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: activeSessionId })
      });
      activeSessionId = null;
      activePartnerId = null;
      chatActiveWindow.style.display = 'none';
      noChatSelected.style.display = 'flex';
      fetchSessions();
    } catch (err) { console.error('Resolve error:', err); }
  };

  // --- 4. Live Socket Events ---
  socket.on('support_queue_update', () => {
    fetchSessions(); // Fully refresh queue
  });

  socket.on('new_support_msg', (data) => {
    if (activePartnerId === data.senderId || activePartnerId === data.receiverId) {
      appendMessage(data);
    }
    fetchSessions(); // Refresh queue snippets
  });

  socket.on('support_typing_status', (data) => {
    if (data.isTyping && !document.getElementById('typing-indicator')) {
      const div = document.createElement('div');
      div.id = 'typing-indicator';
      div.className = 'bubble received';
      div.style.fontStyle = 'italic';
      div.style.opacity = '0.7';
      div.innerText = 'User is typing...';
      messagesContainer.appendChild(div);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    } else if (!data.isTyping) {
      const el = document.getElementById('typing-indicator');
      if (el) el.remove();
    }
  });

  // Urgency Timer Refresh: Every 10 seconds
  setInterval(renderQueue, 10000);

  fetchSessions();
});
