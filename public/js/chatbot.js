document.addEventListener('DOMContentLoaded', () => {
  // Inject HTML for floating chatbot
  const widgetHTML = `
    <div id="floating-chatbot">
      <div id="chat-widget-window" class="hidden">
        <div id="chat-widget-header">
          <span>🌿 MindSpace AI</span>
          <span id="close-chat-btn" style="cursor: pointer; opacity: 0.5;">&times;</span>
        </div>
        <div id="chat-widget-body">
          <div class="bot-msg">Hi! I'm your MindSpace guide. How can I support your journey today?</div>
        </div>
        <div id="chat-widget-input-area">
          <input type="text" id="chat-widget-input" placeholder="How are you feeling?">
          <button id="chat-widget-send">Send</button>
        </div>
      </div>
      <button id="chat-bubble-btn">💬</button>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', widgetHTML);

  const bubbleBtn = document.getElementById('chat-bubble-btn');
  const chatWindow = document.getElementById('chat-widget-window');
  const closeBtn = document.getElementById('close-chat-btn');
  const sendBtn = document.getElementById('chat-widget-send');
  const inputField = document.getElementById('chat-widget-input');
  const bodyArea = document.getElementById('chat-widget-body');

  bubbleBtn.addEventListener('click', () => {
    chatWindow.classList.toggle('hidden');
    if (!chatWindow.classList.contains('hidden')) {
      inputField.focus();
    }
  });

  closeBtn.addEventListener('click', () => {
    chatWindow.classList.add('hidden');
  });

  const appendMessage = (text, isUser = false) => {
    const div = document.createElement('div');
    div.classList.add(isUser ? 'user-msg' : 'bot-msg', 'fade-in');
    
    if (!isUser) {
      div.innerHTML = '<span class="typing-dots">...</span>';
      bodyArea.appendChild(div);
      bodyArea.scrollTop = bodyArea.scrollHeight;
      
      setTimeout(() => {
        div.innerText = text;
        bodyArea.scrollTop = bodyArea.scrollHeight;
      }, 800);
    } else {
      div.innerText = text;
      bodyArea.appendChild(div);
      bodyArea.scrollTop = bodyArea.scrollHeight;
    }
  };

  const sendMessage = async () => {
    const text = inputField.value.trim();
    if (!text) return;
    
    appendMessage(text, true);
    inputField.value = '';

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      });
      const data = await res.json();
      appendMessage(data.text || "I'm here for you. Could you tell me more?");
    } catch (err) {
      appendMessage("I'm having a little trouble connecting right now. Please try again.");
    }
  };

  sendBtn.addEventListener('click', sendMessage);
  inputField.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });
});
