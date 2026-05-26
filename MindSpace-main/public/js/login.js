// Premium Auth Component Logic
const API_URL = '/api';

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('auth-form');
    const btnAnon = document.getElementById('btn-anonymous');
    const tabLogin = document.getElementById('tab-login');
    const tabRegister = document.getElementById('tab-register');
    const submitBtn = document.getElementById('submit-auth');
    const authTitle = document.getElementById('auth-title');
    const errorBox = document.getElementById('auth-error');

    let mode = 'login'; // 'login' or 'register'

    const authSubtitle = document.getElementById('auth-subtitle');

    // Unified Mode Switching
    const setMode = (newMode) => {
        mode = newMode;
        if (mode === 'login') {
            tabLogin.classList.add('active');
            tabRegister.classList.remove('active');
            submitBtn.innerText = 'Get Started';
            authTitle.innerText = 'Sign in to MindSpace';
            authSubtitle.innerText = 'Your journey to mental wellness starts here.';
        } else {
            tabRegister.classList.add('active');
            tabLogin.classList.remove('active');
            submitBtn.innerText = 'Create Account';
            authTitle.innerText = 'Join MindSpace';
            authSubtitle.innerText = 'Start your journey to mental clarity today.';
        }
        errorBox.innerText = '';
    };

    tabLogin.addEventListener('click', () => setMode('login'));
    tabRegister.addEventListener('click', () => setMode('register'));

    // Anonymous Access
    btnAnon.addEventListener('click', async () => {
        try {
            // First, try to get or create an anonymous user on the server
            let anonId = localStorage.getItem('mindspace_anon_id') || ('anon_' + Math.random().toString(36).substr(2, 9));
            
            const res = await fetch(`${API_URL}/user/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ anonymousId: anonId })
            });
            const data = await res.json();
            
            localStorage.setItem('mindspace_anon_id', data.anonymousId);
            localStorage.setItem('mindspace_user', JSON.stringify(data));
            window.location.href = 'home.html';
        } catch (err) {
            console.error('Anonymous login error:', err);
            window.location.href = 'home.html'; // Fallback
        }
    });

    // Main Auth Submit
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorBox.innerText = '';
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="typing-dots">...</span>';

        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value.trim();

        if (!username || !password) {
            errorBox.innerText = 'Please fill in all fields.';
            submitBtn.disabled = false;
            submitBtn.innerText = mode === 'login' ? 'Sign In' : 'Create Account';
            return;
        }

        const endpoint = mode === 'login' ? '/auth/login' : '/auth/register';
        
        try {
            const res = await fetch(`${API_URL}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();

            if (data.error) {
                errorBox.innerText = data.error;
                submitBtn.disabled = false;
                submitBtn.innerText = mode === 'login' ? 'Sign In' : 'Create Account';
            } else if (data.success || data._id) {
                const user = data.user || data;
                
                if (user.role === 'admin') {
                    errorBox.innerHTML = 'Personal accounts only. Use the <a href="admin-login.html" style="color: #4a90e2;">Admin Portal</a> for NGO access.';
                    submitBtn.disabled = false;
                    submitBtn.innerText = mode === 'login' ? 'Sign In' : 'Create Account';
                    return;
                }

                // Premium Success Animation would go here
                localStorage.setItem('mindspace_user', JSON.stringify(user));
                localStorage.setItem('mindspace_anon_id', user.anonymousId);
                
                window.location.href = 'home.html';
            }
        } catch (error) {
            errorBox.innerText = 'Connection error. Are you offline?';
            submitBtn.disabled = false;
            submitBtn.innerText = mode === 'login' ? 'Sign In' : 'Create Account';
        }
    });

    // Reset Password Modal
    const modal = document.getElementById('reset-modal');
    const forgotLink = document.getElementById('forgot-link');
    const closeBtn = document.getElementById('close-reset');
    const resetSubmit = document.getElementById('reset-submit');
    const resetMsg = document.getElementById('reset-msg');

    if (forgotLink) {
        forgotLink.addEventListener('click', (e) => {
            e.preventDefault();
            modal.style.display = 'flex';
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
            resetMsg.innerText = '';
        });
    }

    if (resetSubmit) {
        resetSubmit.addEventListener('click', async () => {
            const username = document.getElementById('reset-username').value.trim();
            const newPassword = document.getElementById('reset-new-password').value.trim();
            
            if (!username || !newPassword) {
                resetMsg.style.color = '#fca5a5';
                resetMsg.innerText = 'Both fields are required.';
                return;
            }

            try {
                const res = await fetch(`${API_URL}/auth/reset-password`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, newPassword })
                });
                const data = await res.json();
                
                if (data.success) {
                    resetMsg.style.color = '#4ade80';
                    resetMsg.innerText = '✅ Password updated successfully.';
                    setTimeout(() => { modal.style.display = 'none'; resetMsg.innerText = ''; }, 2000);
                } else {
                    resetMsg.style.color = '#fca5a5';
                    resetMsg.innerText = data.error || 'User not found.';
                }
            } catch (err) {
                resetMsg.style.color = '#fca5a5';
                resetMsg.innerText = 'Request failed. Try again.';
            }
        });
    }

    // Auto-login if session exists
    const curUser = JSON.parse(localStorage.getItem('mindspace_user') || 'null');
    if (curUser && curUser.role !== 'admin' && location.pathname.includes('user-login')) {
        window.location.href = 'home.html';
    }
});
