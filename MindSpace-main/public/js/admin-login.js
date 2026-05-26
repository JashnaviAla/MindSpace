const API_URL = 'http://localhost:3000/api';

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('admin-auth-form');
  const submitBtn = document.getElementById('submit-admin-auth');
  const errorBox = document.getElementById('admin-auth-error');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('admin-username').value;
    const password = document.getElementById('admin-password').value;

    // We send to the standard auth endpoint, but we check role upon success
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();

      if (data.error) {
        errorBox.innerText = data.error;
      } else if (data.success) {
        if (data.user.role === 'admin') {
          // Store explicit user reference
          localStorage.setItem('mindspace_user', JSON.stringify(data.user));
          // Store token representing admin
          localStorage.setItem('admin_token', data.user._id);
          window.location.href = 'admin.html';
        } else {
          errorBox.innerText = 'Unauthorized: not an admin account.';
        }
      }
    } catch (error) {
      errorBox.innerText = 'Network error. Try again.';
    }
  });

  // Check if admin is already logged in
  const adminToken = localStorage.getItem('admin_token');
  const curUser = JSON.parse(localStorage.getItem('mindspace_user') || 'null');
  if (adminToken && curUser && curUser.role === 'admin') {
    window.location.href = 'admin.html';
  }
});
