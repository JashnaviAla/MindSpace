document.addEventListener('DOMContentLoaded', () => {
  const socket = io();
  const user = JSON.parse(localStorage.getItem('mindspace_user'));

  if (!user) {
    window.location.href = 'index.html';
    return;
  }

  // Join the unique support room & register status
  socket.emit('join_chat', { userId: user._id });
  socket.emit('register_user_status', { userId: user._id });

  const chatWindow = document.getElementById('chat-window');
  const chatInput = document.getElementById('chat-input');
  const sendBtn = document.getElementById('send-btn');

  // Any message history will just show "Consultant" for the other side initially
  const consultId = "600000000000000000000001"; // Placeholder until a real admin replies

  // Fetch History: Between user and *any* admin
  const fetchSupportHistory = async () => {
    try {
      const res = await fetch(`/api/chat/history/${user._id}/consultant_pool`);
      const history = await res.json();
      if (history.length > 0) {
        chatWindow.innerHTML = '';
        history.forEach(msg => appendMessage(msg));
      }
    } catch (err) {
      console.error('Support history fetch error:', err);
    }
  };

  fetchSupportHistory();

  const sendMessage = () => {
    const message = chatInput.value.trim();
    if (!message) return;

    socket.emit('send_message', {
      userId: user._id, // Room target
      sender: 'user',
      text: message,
      senderId: user._id,
      receiverId: consultId, // Initial target
      isConsultant: false
    });

    chatInput.value = '';
    chatInput.focus();
    
    // Stop typing immediately on send
    socket.emit('support_stop_typing', { userId: user._id, isConsultant: false });
  };

  sendBtn.onclick = sendMessage;
  chatInput.onkeypress = (e) => { if (e.key === 'Enter') sendMessage(); };

  // --- Real-time Events ---
  socket.on('receive_message', (data) => {
    // Clear typing indicator
    const el = document.getElementById('typing-indicator');
    if (el) el.remove();

    // Clear placeholder/initial greeting if first message
    const placeholder = chatWindow.querySelector('h3');
    if (placeholder) chatWindow.innerHTML = '';

    appendMessage(data);
  });

  // Typing Indicator Logic
  let typingTimeout;
  chatInput.oninput = () => {
    // Correct logic: emit typing status, NOT the message text!
    socket.emit('support_typing', { userId: user._id, isConsultant: false });
    
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      socket.emit('support_stop_typing', { userId: user._id, isConsultant: false });
    }, 2000);
  };

  socket.on('support_typing_status', (data) => {
    if (data.isTyping && !document.getElementById('typing-indicator')) {
      const div = document.createElement('div');
      div.id = 'typing-indicator';
      div.className = 'bubble consultant-bubble';
      div.style.fontStyle = 'italic';
      div.style.opacity = '0.7';
      div.innerText = 'Consultant is typing...';
      chatWindow.appendChild(div);
      chatWindow.scrollTop = chatWindow.scrollHeight;
    } else if (!data.isTyping) {
      const el = document.getElementById('typing-indicator');
      if (el) el.remove();
    }
  });

  const appendMessage = (data) => {
    // Bubble coloring logic
    const isConsultant = data.isConsultant || (data.senderType === 'admin');
    
    const div = document.createElement('div');
    div.className = `bubble ${isConsultant ? 'consultant-bubble' : 'user-bubble'}`;
    
    const timeStr = new Date(data.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    div.innerHTML = `
      <div>${data.message || data.text}</div>
      <span class="chat-time">${timeStr}</span>
    `;
    
    chatWindow.appendChild(div);
    chatWindow.scrollTop = chatWindow.scrollHeight;
  };
});
