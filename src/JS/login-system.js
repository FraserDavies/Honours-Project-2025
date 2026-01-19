// DOM Elements
const loginForm = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const loginBtn = document.getElementById('loginBtn');
const btnText = document.getElementById('btnText');
const btnSpinner = document.getElementById('btnSpinner');
const message = document.getElementById('message');
const loginSection = document.getElementById('loginSection');
const dashboardSection = document.getElementById('dashboardSection');
const logoutBtn = document.getElementById('logoutBtn');

// API Base URL
const API_URL = 'http://localhost:3000/api';

// Check for existing session on page load
document.addEventListener('DOMContentLoaded', () => {
    const savedUser = localStorage.getItem('gantt_user');
    if (savedUser) {
        const user = JSON.parse(savedUser);
        showDashboard(user);
    }
});

// Handle login form submission
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = emailInput.value.trim();

    if (!email) {
        showMessage('Please enter your email address.', 'error');
        return;
    }

    // Show loading state
    setLoading(true);
    hideMessage();

    try {
        const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email }),
        });

        const data = await response.json();

        if (data.success) {
            // Save user to localStorage
            localStorage.setItem('gantt_user', JSON.stringify(data.user));

            // Show success message briefly, then show dashboard
            showMessage(`Welcome, ${data.user.name}!`, 'success');

            setTimeout(() => {
                showDashboard(data.user);
            }, 500);
        } else {
            showMessage(data.message || 'Login failed. Please try again.', 'error');
        }
    } catch (error) {
        console.error('Login error:', error);
        showMessage('Unable to connect to the server. Make sure the server is running.', 'error');
    } finally {
        setLoading(false);
    }
});

// Handle logout
logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('gantt_user');
    showLogin();
});

// Show dashboard with user info
function showDashboard(user) {
    // Update dashboard content
    document.getElementById('userName').textContent = user.name;
    document.getElementById('userEmail').textContent = user.email;
    document.getElementById('userProjectId').textContent = user.project_id;

    // Get initials for avatar
    const initials = user.name
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    document.getElementById('userInitials').textContent = initials;

    // Switch views
    loginSection.classList.add('hidden');
    dashboardSection.classList.add('show');
}

// Show login form
function showLogin() {
    loginSection.classList.remove('hidden');
    dashboardSection.classList.remove('show');
    emailInput.value = '';
    hideMessage();
}

// Show message
function showMessage(text, type) {
    message.textContent = text;
    message.className = `message show message-${type}`;
}

// Hide message
function hideMessage() {
    message.classList.remove('show');
}

// Set loading state
function setLoading(loading) {
    loginBtn.disabled = loading;
    btnText.style.display = loading ? 'none' : 'inline';
    btnSpinner.style.display = loading ? 'block' : 'none';
}

// Allow Enter key to submit
emailInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        loginForm.dispatchEvent(new Event('submit'));
    }
});
