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

    const isSupervisor = user.role === 'supervisor';

    // Update projects title based on role
    const projectsTitle = document.querySelector('.projects-title');
    if (projectsTitle) {
        projectsTitle.textContent = isSupervisor ? 'Supervised Projects' : 'Your Projects';
    }

    // Hide "Create New Gantt Chart" button for supervisors
    if (createProjectBtn) {
        createProjectBtn.style.display = isSupervisor ? 'none' : '';
    }

    // Display user's projects
    const projectsContainer = document.getElementById('userProjects');
    projectsContainer.innerHTML = '';

    if (user.projects && user.projects.length > 0) {
        user.projects.forEach(project => {
            const projectBadge = document.createElement('a');
            projectBadge.className = 'project-badge';
            const roleParam = isSupervisor ? '&role=supervisor' : '';
            projectBadge.href = `../../gantt-builder/public/gantt-chart.html?project=${encodeURIComponent(project.project_id)}${roleParam}`;
            projectBadge.innerHTML = `
                <span class="project-id">${project.project_id}</span>
                ${project.project_name ? `<span class="project-name"> ${project.project_name}</span>` : ''}
            `;
            projectsContainer.appendChild(projectBadge);
        });
    } else {
        projectsContainer.innerHTML = `<p class="no-projects">${isSupervisor ? 'No supervised projects assigned' : 'No projects assigned'}</p>`;
    }

    // Supervisor: add "Add supervised project" form below the list
    const existingAddSection = document.getElementById('addSupervisedProject');
    if (existingAddSection) existingAddSection.remove();

    if (isSupervisor) {
        const addSection = document.createElement('div');
        addSection.id = 'addSupervisedProject';
        addSection.className = 'add-supervised-project';
        addSection.innerHTML = `
            <p class="add-project-label">Add supervised project:</p>
            <div class="add-project-row">
                <input type="number" id="supervisorProjectIdInput" class="form-input add-project-input" placeholder="Project ID" min="1">
                <button class="btn btn-primary add-project-btn" id="addSupervisedProjectBtn">Add</button>
            </div>
            <div id="addProjectMsg" class="message"></div>
        `;
        document.querySelector('.projects-section').appendChild(addSection);

        document.getElementById('supervisorProjectIdInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') document.getElementById('addSupervisedProjectBtn').click();
        });

        document.getElementById('addSupervisedProjectBtn').addEventListener('click', async () => {
            const input = document.getElementById('supervisorProjectIdInput');
            const msgEl = document.getElementById('addProjectMsg');
            const projectId = parseInt(input.value.trim());

            if (!projectId || projectId < 1) {
                msgEl.textContent = 'Please enter a valid project ID.';
                msgEl.className = 'message show message-error';
                return;
            }

            const savedUser = localStorage.getItem('gantt_user');
            if (!savedUser) return;
            const currentUser = JSON.parse(savedUser);

            const btn = document.getElementById('addSupervisedProjectBtn');
            btn.disabled = true;

            try {
                const resp = await fetch(`${API_URL}/supervisors/${currentUser.supervisor_id}/projects`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ project_id: projectId })
                });
                const data = await resp.json();

                if (data.success) {
                    currentUser.projects = currentUser.projects || [];
                    currentUser.projects.push(data.project);
                    localStorage.setItem('gantt_user', JSON.stringify(currentUser));

                    const noProjects = projectsContainer.querySelector('.no-projects');
                    if (noProjects) noProjects.remove();

                    const badge = document.createElement('a');
                    badge.className = 'project-badge';
                    badge.href = `../../gantt-builder/public/gantt-chart.html?project=${data.project.project_id}&role=supervisor`;
                    badge.innerHTML = `
                        <span class="project-id">${data.project.project_id}</span>
                        ${data.project.project_name ? `<span class="project-name"> ${data.project.project_name}</span>` : ''}
                    `;
                    projectsContainer.appendChild(badge);

                    input.value = '';
                    msgEl.textContent = `Project ${data.project.project_id} added.`;
                    msgEl.className = 'message show message-success';
                } else {
                    msgEl.textContent = data.message || 'Failed to add project.';
                    msgEl.className = 'message show message-error';
                }
            } catch (err) {
                msgEl.textContent = 'Unable to connect to server.';
                msgEl.className = 'message show message-error';
            } finally {
                btn.disabled = false;
            }
        });
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

// =============== CREATE PROJECT MODAL ===============
const createProjectModal  = document.getElementById('createProjectModal');
const createProjectBtn    = document.getElementById('createProjectBtn');
const createProjectCancel = document.getElementById('createProjectCancel');
const createProjectSubmit = document.getElementById('createProjectSubmit');
const createProjectMsg    = document.getElementById('createProjectMessage');

function showCreateProjectMessage(text, type) {
    createProjectMsg.textContent = text;
    createProjectMsg.className = `message show message-${type}`;
}

function clearCreateProjectForm() {
    document.getElementById('newProjectTitle').value = '';
    document.getElementById('newProjectDesc').value  = '';
    document.getElementById('newProjectStart').value = '';
    document.getElementById('newProjectEnd').value   = '';
    createProjectMsg.classList.remove('show');
}

if (createProjectBtn) {
    createProjectBtn.addEventListener('click', () => {
        clearCreateProjectForm();
        createProjectModal.classList.add('visible');
    });
}

if (createProjectCancel) {
    createProjectCancel.addEventListener('click', () => {
        createProjectModal.classList.remove('visible');
    });
}

if (createProjectModal) {
    createProjectModal.addEventListener('click', (e) => {
        if (e.target === createProjectModal) createProjectModal.classList.remove('visible');
    });
}

if (createProjectSubmit) {
    createProjectSubmit.addEventListener('click', async () => {
        const title = document.getElementById('newProjectTitle').value.trim();
        const desc  = document.getElementById('newProjectDesc').value.trim();
        const start = document.getElementById('newProjectStart').value;
        const end   = document.getElementById('newProjectEnd').value;

        if (!title) {
            showCreateProjectMessage('Project title is required.', 'error');
            return;
        }
        if (!start || !end) {
            showCreateProjectMessage('Start date and end date are required.', 'error');
            return;
        }
        if (end < start) {
            showCreateProjectMessage('End date cannot be before the start date.', 'error');
            return;
        }

        const savedUser = localStorage.getItem('gantt_user');
        if (!savedUser) return;
        const user = JSON.parse(savedUser);

        createProjectSubmit.disabled = true;
        createProjectSubmit.textContent = 'Creating…';

        try {
            const resp = await fetch(`${API_URL}/projects`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    student_id:          user.student_id,
                    project_name:        title,
                    project_description: desc || null,
                    start_date:          start,
                    end_date:            end
                })
            });
            const data = await resp.json();

            if (data.success) {
                // Add the new project to the cached user object so the dashboard
                // shows it immediately without requiring a fresh login.
                user.projects = user.projects || [];
                user.projects.push({
                    project_id:          data.project_id,
                    project_name:        title,
                    project_description: desc || null
                });
                localStorage.setItem('gantt_user', JSON.stringify(user));

                window.location.href =
                    `../../gantt-builder/public/gantt-chart.html?project=${data.project_id}&new=true`;
            } else {
                showCreateProjectMessage(data.message || 'Failed to create project.', 'error');
                createProjectSubmit.disabled = false;
                createProjectSubmit.textContent = 'Create Project';
            }
        } catch (err) {
            showCreateProjectMessage('Unable to connect to server.', 'error');
            createProjectSubmit.disabled = false;
            createProjectSubmit.textContent = 'Create Project';
        }
    });
}
