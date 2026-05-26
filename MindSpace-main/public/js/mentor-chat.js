document.addEventListener('DOMContentLoaded', async () => {
  const socket = io();
  const user = JSON.parse(localStorage.getItem('mindspace_user'));
  if (!user) {
    window.location.href = 'index.html';
    return;
  }

  const mentorListEl = document.getElementById('mentor-list');
  const chatWindow = document.getElementById('chat-window');
  const chatInput = document.getElementById('chat-input');
  const sendBtn = document.getElementById('send-btn');
  const inputArea = document.getElementById('input-area');

  let activePartnerId = null;

  // --- 1. Fetch and Render Mentors ---
  const fetchMentors = async () => {
    try {
      const res = await fetch('/api/chat/mentors');
      const mentors = await res.json();
      
      mentorListEl.innerHTML = '<h3 style="margin-bottom: 1.5rem;">NGO Mentors</h3>';
      
      if (mentors.length === 0) {
        mentorListEl.innerHTML += '<p class="text-muted">No mentors available right now.</p>';
        return;
      }

      mentors.forEach(m => {
        if (m._id === user._id) return; // Don't chat with self
        
        const div = document.createElement('div');
        div.className = 'mentor-item';
        div.innerHTML = `
          <div style="font-weight: 700;">${m.username || 'Anonymous Mentor'}</div>
          <div style="font-size: 0.8rem; opacity: 0.7;">${m.role.toUpperCase()}</div>
        `;
        div.onclick = () => selectMentor(m._id, m.username || 'Anonymous Mentor', div);
        mentorListEl.appendChild(div);
      });
    } catch (err) {
      console.error('Failed to fetch mentors', err);
    }
  };

  // --- 2. Select Mentor and Fetch History ---
  const selectMentor = async (partnerId, partnerName, element) => {
    activePartnerId = partnerId;

    // UI Updates
    document.querySelectorAll('.mentor-item').forEach(el => el.classList.remove('active'));
    element.classList.add('active');
    inputArea.style.display = 'flex';
    chatWindow.innerHTML = '<div class="text-muted" style="margin: auto;">Loading history...</div>';

    // Socket: Join private room
    socket.emit('join_mentor_chat', { userId: user._id, partnerId });

    // Fetch History
    try {
      const res = await fetch(`/api/chat/history/${user._id}/${partnerId}`);
      const history = await res.json();
      
      chatWindow.innerHTML = '';
      if (history.length === 0) {
        chatWindow.innerHTML = '<div class="text-muted" style="margin: auto;">No messages yet. Say hi! 👋</div>';
      } else {
        history.forEach(msg => appendMessage(msg));
      }
    } catch (err) {
      console.error('Failed to fetch history', err);
    }
  };

  // --- 3. Sending Messages ---
  const sendMessage = () => {
    const message = chatInput.value.trim();
    if (!message || !activePartnerId) return;

    socket.emit('send_mentor_msg', {
      senderId: user._id,
      receiverId: activePartnerId,
      message
    });

    chatInput.value = '';
  };

  sendBtn.onclick = sendMessage;
  chatInput.onkeypress = (e) => { if (e.key === 'Enter') sendMessage(); };

  // --- 4. Receiving Messages ---
  socket.on('new_mentor_msg', (data) => {
    // Only show if the message belongs to the current open chat
    if (
      (data.senderId === user._id && data.receiverId === activePartnerId) ||
      (data.senderId === activePartnerId && data.receiverId === user._id)
    ) {
      // Clear help text if it was there
      if (chatWindow.querySelector('.text-muted')) chatWindow.innerHTML = '';
      appendMessage(data);
    }
  });

  const appendMessage = (data) => {
    const isSelf = data.senderId === user._id;
    const div = document.createElement('div');
    div.className = isSelf ? 'msg-bubble user-msg' : 'msg-bubble mentor-msg';
    
    // Add timestamp
    const time = new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    div.innerHTML = `
      <div>${data.message}</div>
      <div style="font-size: 0.7rem; opacity: 0.7; margin-top: 5px; text-align: ${isSelf ? 'right' : 'left'}">${time}</div>
    `;
    
    chatWindow.appendChild(div);
    chatWindow.scrollTop = chatWindow.scrollHeight;
  };

  // Initial load
  fetchMentors();
});
