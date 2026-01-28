// Get project data from URL parameters and localStorage
document.addEventListener('DOMContentLoaded', () => {
    // Check if user is logged in
    const savedUser = localStorage.getItem('gantt_user');
    if (!savedUser) {
        // Redirect to login if not logged in
        window.location.href = '/index.html';
        return;
    }

    const user = JSON.parse(savedUser);

    // Update header with user name
    const nameParts = user.name.split(' ');
    let formattedName = user.name;
    if (nameParts.length >= 2) {
        const surname = nameParts[nameParts.length - 1];
        const firstname = nameParts.slice(0, -1).join(' ');
        formattedName = `${surname}, ${firstname}`;
    }
    document.getElementById('headerUserName').textContent = formattedName;

    // Get project info from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const projectId = urlParams.get('project');

    if (projectId && user.projects) {
        // Find the project in user's projects (compare as strings since URL param is string)
        const project = user.projects.find(p => String(p.project_id) === projectId);

        if (project) {
            document.getElementById('projectNumber').textContent = `Project ${project.project_id}`;
            document.getElementById('projectTitle').textContent = project.project_name || 'Untitled Project';
            document.title = `${project.project_name} - Gantt Chart Builder`;

            // Handle description with show more/less
            const description = project.project_description || '';
            const descContainer = document.getElementById('projectDesc');
            const maxLength = 100;

            if (description.length > maxLength) {
                const truncated = description.substring(0, maxLength) + '...';
                descContainer.innerHTML = `
                    <span class="desc-text">${truncated}</span>
                    <a href="#" class="desc-toggle" data-expanded="false">more</a>
                `;

                // Store full description for toggling
                descContainer.dataset.fullText = description;
                descContainer.dataset.truncatedText = truncated;

                // Add click handler for toggle
                const toggle = descContainer.querySelector('.desc-toggle');
                toggle.addEventListener('click', (e) => {
                    e.preventDefault();
                    const isExpanded = toggle.dataset.expanded === 'true';
                    const textSpan = descContainer.querySelector('.desc-text');

                    if (isExpanded) {
                        textSpan.textContent = descContainer.dataset.truncatedText;
                        toggle.textContent = 'more';
                        toggle.dataset.expanded = 'false';
                    } else {
                        textSpan.textContent = descContainer.dataset.fullText;
                        toggle.textContent = 'less';
                        toggle.dataset.expanded = 'true';
                    }
                });
            } else {
                descContainer.textContent = description;
            }
        } else {
            document.getElementById('projectNumber').textContent = `Project ${projectId}`;
            document.getElementById('projectTitle').textContent = 'Project Not Found';
            document.getElementById('projectDesc').textContent = '';
        }
    } else {
        document.getElementById('projectTitle').textContent = 'No Project Selected';
    }
});

// Handle sign out
document.getElementById('headerSignOut').addEventListener('click', (e) => {
    e.preventDefault();
    localStorage.removeItem('gantt_user');
    window.location.href = '/index.html';
});