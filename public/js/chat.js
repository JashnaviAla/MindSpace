document.addEventListener('DOMContentLoaded', () => {
  const socket = io();
  const chatWindow = document.getElementById('chat-window');
  const chatInput = document.getElementById('chat-input');
  const sendBtn = document.getElementById('send-chat');
  
  // New UI Elements
  const statusBanner = document.getElementById('chat-status');
  const skipBtn = document.getElementById('skip-btn');

  let isConnected = false;

  // Auto-join matchmaking queue on connect
  socket.on('connect', () => {
    socket.emit('find_match');
  });

  socket.on('waiting', (data) => {
    isConnected = false;
    statusBanner.style.background = 'rgba(255, 193, 7, 0.2)';
    statusBanner.style.color = '#b7791f';
    statusBanner.innerText = data.text;
    skipBtn.style.display = 'none';
    chatInput.disabled = true;
    chatWindow.innerHTML = ''; // clear chat
  });

  socket.on('chat_start', (data) => {
    isConnected = true;
    statusBanner.style.background = 'rgba(56, 178, 172, 0.1)';
    statusBanner.style.color = 'var(--accent)';
    statusBanner.innerText = data.text;
    skipBtn.style.display = 'block';
    chatInput.disabled = false;
    chatInput.focus();
    chatWindow.innerHTML = ''; // clear previous chats
    appendMessage('System', 'A stranger has connected. Say hi!', true);
  });

  socket.on('partner_left', (data) => {
    isConnected = false;
    appendMessage('System', data.text, true);
    statusBanner.style.background = 'rgba(217, 4, 41, 0.1)';
    statusBanner.style.color = '#d90429';
    statusBanner.innerText = 'Stranger disconnected.';
    skipBtn.style.display = 'none';
    chatInput.disabled = true;
    
    // Automatically throw back into queue after 2 seconds
    setTimeout(() => {
      socket.emit('find_match');
    }, 2000);
  });

  socket.on('message', (data) => {
    appendMessage(data.user, data.text, false);
  });

  // Skip partner logic
  skipBtn.addEventListener('click', () => {
    if (isConnected) {
      appendMessage('System', 'You left the chat.', true);
      socket.emit('skip_partner');
      isConnected = false;
      skipBtn.style.display = 'none';
      chatInput.disabled = true;
      
      // Auto queue for next match
      setTimeout(() => {
        socket.emit('find_match');
      }, 500);
    }
  });

  const appendMessage = (user, text, isSystem = false, isSelf = false) => {
    const div = document.createElement('div');
    div.classList.add('chat-message');
    if (isSystem) div.classList.add('system');
    if (isSelf) div.classList.add('self');
    
    if (isSystem) {
      div.innerText = text;
    } else {
      div.innerHTML = `<strong>${isSelf ? 'You' : user}:</strong> ${text}`;
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
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });
});
