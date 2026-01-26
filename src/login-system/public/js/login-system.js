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
const headerUser = document.getElementById('headerUser');
const headerUserName = document.getElementById('headerUserName');
const headerSignOut = document.getElementById('headerSignOut');

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

// Handle logout from dashboard button (if it exists)
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        logout();
    });
}

// Handle logout from header link
headerSignOut.addEventListener('click', (e) => {
    e.preventDefault();
    logout();
});

// Logout function
function logout() {
    localStorage.removeItem('gantt_user');
    showLogin();
}

// Show dashboard with user info
function showDashboard(user) {
    // Update dashboard content
    document.getElementById('userName').textContent = user.name;
    document.getElementById('userEmail').textContent = user.email;

    // Display user's projects
    const projectsContainer = document.getElementById('userProjects');
    projectsContainer.innerHTML = '';

    if (user.projects && user.projects.length > 0) {
        user.projects.forEach(project => {
            const projectBadge = document.createElement('div');
            projectBadge.className = 'project-badge';
            projectBadge.innerHTML = `
                <span class="project-id">${project.project_id}</span>
                
                ${project.project_name ? `<span class="project-name"> ${project.project_name}</span>` : ''}
            `;
            projectsContainer.appendChild(projectBadge);
        });
    } else {
        projectsContainer.innerHTML = '<p class="no-projects">No projects assigned</p>';
    }

    // Get initials for avatar
    const initials = user.name
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    document.getElementById('userInitials').textContent = initials;

    // Format name as "Surname, Firstname" for header
    const nameParts = user.name.split(' ');
    let formattedName = user.name; // Default to full name

    if (nameParts.length >= 2) {
        // Assume last part is surname, rest is firstname
        const surname = nameParts[nameParts.length - 1];
        const firstname = nameParts.slice(0, -1).join(' ');
        formattedName = `${surname}, ${firstname}`;
    }

    // Update header greeting
    headerUserName.textContent = formattedName;
    headerUser.style.display = 'flex';

    // Switch views
    loginSection.classList.add('hidden');
    dashboardSection.classList.add('show');
}

// Show login form
function showLogin() {
    loginSection.classList.remove('hidden');
    dashboardSection.classList.remove('show');
    headerUser.style.display = 'none';
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
    btnText.hidden = loading;
    btnSpinner.hidden = !loading;
}

// Allow Enter key to submit
emailInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        loginForm.dispatchEvent(new Event('submit'));
    }
});
