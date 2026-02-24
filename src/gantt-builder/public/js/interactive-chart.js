// ============================================
//              Initialisation
// ============================================

// API Base URL
const API_URL = 'http://localhost:3000/api';

// Get project ID from URL query parameter
function getProjectIdFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('project');
}

// Fetch tasks from database
async function fetchTasks(projectId) {
    try {
        const response = await fetch(`${API_URL}/projects/${projectId}/tasks`);
        const data = await response.json();

        if (data.success) {
            return data.tasks;
        } else {
            console.error('Failed to fetch tasks:', data.message);
            return [];
        }
    } catch (error) {
        console.error('Error fetching tasks:', error);
        return [];
    }
}

// Transform database task format to chart format
function transformTaskData(dbTasks) {
    const parseDate = d3.timeParse('%Y-%m-%d');

    return dbTasks.map(task => ({
        id: task.task_id,
        name: task.task_name,
        description: task.description,
        startDate: parseDate(task.start_date),
        endDate: parseDate(task.end_date),
        colour: task.colour || '#3b82f6',
        progress: task.progress_percentage || 0,
        isMilestone: task.is_milestone === 1,
        parentTaskId: task.parent_task_id,
        displayOrder: task.display_order
    }));
}

// Fetch dependencies from database
async function fetchDependencies(projectId) {
    try {
        const response = await fetch(`${API_URL}/projects/${projectId}/dependencies`);
        const data = await response.json();

        if (data.success) {
            return data.dependencies;
        } else {
            console.error('Failed to fetch dependencies:', data.message);
            return [];
        }
    } catch (error) {
        console.error('Error fetching dependencies:', error);
        return [];
    }
}

// Transform database dependency format to chart format
function transformDependencyData(dbDependencies) {
    return dbDependencies.map(dep => ({
        id: dep.dependency_id,
        predecessorTaskId: dep.predecessor_task_id,
        successorTaskId: dep.successor_task_id,
        dependencyType: dep.dependency_type
    }));
}

document.addEventListener('DOMContentLoaded', async () => {
    // Check if chart panel exists
    const chartPanel = document.getElementById('chartPanel');
    const taskListEl = document.getElementById('taskList');

    if (!chartPanel || !taskListEl) {
        console.log('Gantt chart elements not found');
        return;
    }

    // Get project ID from URL
    const projectId = getProjectIdFromUrl();

    if (!projectId) {
        console.error('No project ID specified in URL');
        taskListEl.innerHTML = '<p class="no-tasks">No project selected. Please select a project from the dashboard.</p>';
        return;
    }

    // Fetch tasks and dependencies from database
    const [dbTasks, dbDependencies] = await Promise.all([
        fetchTasks(projectId),
        fetchDependencies(projectId)
    ]);

    if (dbTasks.length === 0) {
        console.log('No tasks found for project:', projectId);
        taskListEl.innerHTML = '<p class="no-tasks">No tasks found for this project.</p>';
        return;
    }

    // Transform to chart format
    const taskData = transformTaskData(dbTasks);
    const dependencyData = transformDependencyData(dbDependencies);

    // Instantiate components
    const ganttChart = new GanttChart('#chartPanel', {
        rowHeight: 48,
        barHeight: 24,
        dayWidth: 35
    });

    const taskList = new TaskList('#taskList');
    const tooltip = new TooltipManager('#ganttTooltip');

    // Render initial data
    ganttChart.setDependencies(dependencyData);
    ganttChart.render(taskData);
    taskList.render(taskData);

    // Setup linked interactions
    const handleTaskHover = (event, d) => {
        tooltip.show(event, d);
        taskList.highlightItem(d.id);
    };

    const handleTaskOut = (event, d) => {
        tooltip.hide();
        taskList.highlightItem(null);
    };

    const handleTaskClick = (event, d) => {
        console.log('Task clicked:', d);
    };

    const handleListHover = (event, d) => {
        ganttChart.highlightTasks([d.id]);
    };

    const handleListOut = (event, d) => {
        ganttChart.highlightTasks([]);
    };

    const handleListClick = (event, d) => {
        if (isEditMode) return;
        ganttChart.scrollToTask(d.id);
    };

    ganttChart
        .setTaskHover(handleTaskHover)
        .setTaskOut(handleTaskOut)
        .setTaskClick(handleTaskClick);

    taskList
        .setItemHover(handleListHover)
        .setItemOut(handleListOut)
        .setItemClick(handleListClick);

    // Scroll to today on load
    setTimeout(() => {
        ganttChart.scrollToToday();
    }, 600);

    // =============== ZOOM CONTROLS ===============
    const zoomInBtn = document.getElementById('zoomIn');
    const zoomOutBtn = document.getElementById('zoomOut');
    const zoomResetBtn = document.getElementById('zoomReset');
    const zoomLevelDisplay = document.getElementById('zoomLevel');
    const goToTodayBtn = document.getElementById('goToToday');

    // Update zoom level display
    const updateZoomDisplay = (level) => {
        if (zoomLevelDisplay) {
            zoomLevelDisplay.textContent = `${level}%`;
        }
    };

    // Initial zoom level display
    updateZoomDisplay(ganttChart.getZoomLevel());

    // Zoom In button
    if (zoomInBtn) {
        zoomInBtn.addEventListener('click', () => {
            const newZoom = ganttChart.zoomIn();
            updateZoomDisplay(newZoom);
        });
    }

    // Zoom Out button
    if (zoomOutBtn) {
        zoomOutBtn.addEventListener('click', () => {
            const newZoom = ganttChart.zoomOut();
            updateZoomDisplay(newZoom);
        });
    }

    // Reset Zoom button
    if (zoomResetBtn) {
        zoomResetBtn.addEventListener('click', () => {
            const newZoom = ganttChart.resetZoom();
            updateZoomDisplay(newZoom);
        });
    }

    // Go to Today button
    if (goToTodayBtn) {
        goToTodayBtn.addEventListener('click', () => {
            ganttChart.scrollToToday();
        });
    }

    // =============== EXPORT CONTROLS ===============
    const exportBtn = document.getElementById('exportBtn');
    const exportModal = document.getElementById('exportModal');
    const exportCancel = document.getElementById('exportCancel');
    const exportConfirm = document.getElementById('exportConfirm');
    const formatBtns = document.querySelectorAll('.export-format-btn');

    let selectedFormat = 'pdf';

    // Format toggle buttons
    formatBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            formatBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedFormat = btn.dataset.format;
        });
    });

    // Open modal
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            exportModal.classList.add('visible');
        });
    }

    // Close modal
    if (exportCancel) {
        exportCancel.addEventListener('click', () => {
            exportModal.classList.remove('visible');
        });
    }

    // Close modal on backdrop click
    if (exportModal) {
        exportModal.addEventListener('click', (e) => {
            if (e.target === exportModal) {
                exportModal.classList.remove('visible');
            }
        });
    }

    // Export action — SVG-based full-chart export
    if (exportConfirm) {
        exportConfirm.addEventListener('click', () => {
            const exportWidth = parseInt(document.getElementById('exportWidth').value) || 1200;
            const exportHeight = parseInt(document.getElementById('exportHeight').value) || 500;

            const chartSvg = document.querySelector('#chartPanel .chart-svg');
            if (!chartSvg) return;

            // Disable button while exporting
            exportConfirm.textContent = 'Exporting...';
            exportConfirm.disabled = true;

            try {
                // --- Dimensions ---
                const taskListWidth = 250; // matches CSS .task-list-panel min/max-width
                const svgWidth = +chartSvg.getAttribute('width');
                const svgHeight = +chartSvg.getAttribute('height');
                const fullWidth = taskListWidth + svgWidth;
                const fullHeight = svgHeight;

                // --- Build combined SVG ---
                const ns = 'http://www.w3.org/2000/svg';
                const combinedSvg = document.createElementNS(ns, 'svg');
                combinedSvg.setAttribute('xmlns', ns);
                combinedSvg.setAttribute('width', exportWidth);
                combinedSvg.setAttribute('height', exportHeight);
                combinedSvg.setAttribute('viewBox', `0 0 ${fullWidth} ${fullHeight}`);

                // Embedded styles (resolve CSS variables to actual values)
                const styleEl = document.createElementNS(ns, 'style');
                styleEl.textContent = `
                    text { font-family: 'Source Sans Pro', sans-serif; }
                    .grid-line { stroke: rgba(0,0,0,0.05); stroke-width: 1; }
                    .grid-line.weekend { stroke: rgba(0,0,0,0.1); }
                    .today-line { stroke: #0d6efd; stroke-width: 2; stroke-dasharray: 4,4; }
                    .today-marker { fill: #0d6efd; font-family: monospace; font-size: 10px; font-weight: 500; }
                    .task-label { font-family: 'Source Sans Pro', sans-serif; font-size: 11px; font-weight: 500; fill: white; }
                    .dependency-line { fill: none; stroke: #333333; stroke-width: 2px; stroke-linecap: round; stroke-linejoin: round; }
                    .row-bg { fill: transparent; }
                    .row-bg.even { fill: rgba(0,0,0,0.01); }
                    .task-bar { cursor: default; }
                    .task-bar-progress { pointer-events: none; }
                    .milestone-diamond { cursor: default; }
                    .axis-x .domain { stroke: #dee2e6; }
                    .axis-x .tick line { stroke: rgba(0,0,0,0.05); }
                    .axis-x .tick text { font-family: 'Source Sans Pro', sans-serif; font-size: 11px; fill: #6c757d; }
                    .month-label { font-family: 'Source Sans Pro', sans-serif; font-weight: 600; fill: #000000; }
                `;
                combinedSvg.appendChild(styleEl);

                // White background
                const bgRect = document.createElementNS(ns, 'rect');
                bgRect.setAttribute('width', fullWidth);
                bgRect.setAttribute('height', fullHeight);
                bgRect.setAttribute('fill', '#ffffff');
                combinedSvg.appendChild(bgRect);

                // --- Task list panel as SVG ---
                const taskListGroup = document.createElementNS(ns, 'g');

                // Header background
                const headerBg = document.createElementNS(ns, 'rect');
                headerBg.setAttribute('x', 0);
                headerBg.setAttribute('y', 0);
                headerBg.setAttribute('width', taskListWidth);
                headerBg.setAttribute('height', ganttChart.margin.top);
                headerBg.setAttribute('fill', '#f7f7f7');
                taskListGroup.appendChild(headerBg);

                // Header text
                const headerText = document.createElementNS(ns, 'text');
                headerText.setAttribute('x', 16);
                headerText.setAttribute('y', ganttChart.margin.top / 2);
                headerText.setAttribute('dy', '0.35em');
                headerText.setAttribute('font-size', '11px');
                headerText.setAttribute('font-weight', '600');
                headerText.setAttribute('letter-spacing', '0.05em');
                headerText.setAttribute('fill', '#6c757d');
                headerText.textContent = 'TASKS';
                taskListGroup.appendChild(headerText);

                // Header bottom border
                const headerBorder = document.createElementNS(ns, 'line');
                headerBorder.setAttribute('x1', 0);
                headerBorder.setAttribute('y1', ganttChart.margin.top);
                headerBorder.setAttribute('x2', taskListWidth);
                headerBorder.setAttribute('y2', ganttChart.margin.top);
                headerBorder.setAttribute('stroke', '#dee2e6');
                headerBorder.setAttribute('stroke-width', 1);
                taskListGroup.appendChild(headerBorder);

                // Task rows
                ganttChart.data.forEach((task, i) => {
                    const rowY = ganttChart.margin.top + i * ganttChart.rowHeight;

                    // Row separator line
                    const rowLine = document.createElementNS(ns, 'line');
                    rowLine.setAttribute('x1', 0);
                    rowLine.setAttribute('y1', rowY + ganttChart.rowHeight);
                    rowLine.setAttribute('x2', taskListWidth);
                    rowLine.setAttribute('y2', rowY + ganttChart.rowHeight);
                    rowLine.setAttribute('stroke', 'rgba(0,0,0,0.05)');
                    rowLine.setAttribute('stroke-width', 1);
                    taskListGroup.appendChild(rowLine);

                    const centerY = rowY + ganttChart.rowHeight / 2;

                    // Colour indicator (diamond for milestones, circle for regular)
                    if (task.isMilestone) {
                        const diamond = document.createElementNS(ns, 'rect');
                        diamond.setAttribute('x', 16 - 5);
                        diamond.setAttribute('y', centerY - 5);
                        diamond.setAttribute('width', 10);
                        diamond.setAttribute('height', 10);
                        diamond.setAttribute('fill', task.colour || '#f59e0b');
                        diamond.setAttribute('transform', `rotate(45, 16, ${centerY})`);
                        taskListGroup.appendChild(diamond);
                    } else {
                        const circle = document.createElementNS(ns, 'circle');
                        circle.setAttribute('cx', 16);
                        circle.setAttribute('cy', centerY);
                        circle.setAttribute('r', 5);
                        circle.setAttribute('fill', task.colour || '#3b82f6');
                        taskListGroup.appendChild(circle);
                    }

                    // Task name
                    const nameText = document.createElementNS(ns, 'text');
                    nameText.setAttribute('x', 34);
                    nameText.setAttribute('y', centerY);
                    nameText.setAttribute('dy', '0.35em');
                    nameText.setAttribute('font-size', '13px');
                    nameText.setAttribute('font-weight', '500');
                    nameText.setAttribute('fill', '#000000');
                    // Truncate long names
                    const maxNameLen = 22;
                    nameText.textContent = task.name.length > maxNameLen
                        ? task.name.substring(0, maxNameLen) + '...'
                        : task.name;
                    taskListGroup.appendChild(nameText);

                    // Start date
                    const dateText = document.createElementNS(ns, 'text');
                    dateText.setAttribute('x', taskListWidth - 8);
                    dateText.setAttribute('y', centerY);
                    dateText.setAttribute('dy', '0.35em');
                    dateText.setAttribute('text-anchor', 'end');
                    dateText.setAttribute('font-size', '10px');
                    dateText.setAttribute('font-family', 'monospace');
                    dateText.setAttribute('fill', '#6c757d');
                    dateText.textContent = d3.timeFormat('%d %b')(task.startDate);
                    taskListGroup.appendChild(dateText);
                });

                combinedSvg.appendChild(taskListGroup);

                // Vertical separator between task list and chart
                const separator = document.createElementNS(ns, 'line');
                separator.setAttribute('x1', taskListWidth);
                separator.setAttribute('y1', 0);
                separator.setAttribute('x2', taskListWidth);
                separator.setAttribute('y2', fullHeight);
                separator.setAttribute('stroke', '#dee2e6');
                separator.setAttribute('stroke-width', 1);
                combinedSvg.appendChild(separator);

                // --- Clone chart SVG into a translated group ---
                const chartGroup = document.createElementNS(ns, 'g');
                chartGroup.setAttribute('transform', `translate(${taskListWidth}, 0)`);
                // Clone all children of the chart SVG
                Array.from(chartSvg.childNodes).forEach(child => {
                    chartGroup.appendChild(child.cloneNode(true));
                });
                combinedSvg.appendChild(chartGroup);

                // --- Render SVG to canvas ---
                const serializer = new XMLSerializer();
                const svgString = serializer.serializeToString(combinedSvg);
                const svgDataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);

                const scale = 2; // 2x for crispness
                const canvas = document.createElement('canvas');
                canvas.width = exportWidth * scale;
                canvas.height = exportHeight * scale;
                const ctx = canvas.getContext('2d');

                const img = new Image();
                img.onload = () => {
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                    const projectTitle = document.getElementById('projectTitle')?.textContent || 'gantt-chart';
                    const filename = projectTitle.replace(/[^a-z0-9]/gi, '-').toLowerCase();

                    if (selectedFormat === 'jpeg') {
                        canvas.toBlob((blob) => {
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `${filename}.jpg`;
                            a.click();
                            URL.revokeObjectURL(url);
                        }, 'image/jpeg', 0.95);
                    } else {
                        const { jsPDF } = window.jspdf;
                        const imgData = canvas.toDataURL('image/png');
                        const orientation = exportWidth > exportHeight ? 'landscape' : 'portrait';
                        const pdf = new jsPDF(orientation, 'px', [exportWidth, exportHeight]);
                        pdf.addImage(imgData, 'PNG', 0, 0, exportWidth, exportHeight);
                        pdf.save(`${filename}.pdf`);
                    }

                    // Close modal after export
                    exportModal.classList.remove('visible');
                    exportConfirm.textContent = 'Export';
                    exportConfirm.disabled = false;
                };

                img.onerror = () => {
                    console.error('Export failed: could not render SVG to canvas');
                    alert('Export failed. Please try again.');
                    exportConfirm.textContent = 'Export';
                    exportConfirm.disabled = false;
                };

                img.src = svgDataUrl;
            } catch (err) {
                console.error('Export failed:', err);
                alert('Export failed. Please try again.');
                exportConfirm.textContent = 'Export';
                exportConfirm.disabled = false;
            }
        });
    }

    // =============== EDIT MODE ===============
    let isEditMode = false;
    let pendingChanges = new Map(); // taskId -> { task_name?, start_date?, end_date? }
    let taskSnapshot = null;       // snapshot of task data before editing

    const editModeBtn  = document.getElementById('editModeBtn');
    const editBanner   = document.getElementById('editModeBanner');
    const editCancelBtn = document.getElementById('editCancelBtn');
    const editSaveBtn  = document.getElementById('editSaveBtn');

    const enterEditMode = () => {
        isEditMode = true;
        pendingChanges.clear();

        // Snapshot task data so we can revert on cancel
        taskSnapshot = taskData.map(t => ({
            id: t.id,
            name: t.name,
            startDate: new Date(t.startDate),
            endDate: new Date(t.endDate)
        }));

        ganttChart.enableEditMode();
        taskList.enableEditMode();

        editBanner.classList.add('visible');
        editModeBtn.style.display = 'none';
    };

    const exitEditMode = (save) => {
        if (!save && taskSnapshot) {
            // Revert task data to snapshot
            taskSnapshot.forEach(snap => {
                const task = taskData.find(t => t.id === snap.id);
                if (task) {
                    task.name = snap.name;
                    task.startDate = snap.startDate;
                    task.endDate = snap.endDate;
                }
            });
        }

        pendingChanges.clear();
        taskSnapshot = null;
        isEditMode = false;

        ganttChart.disableEditMode();
        taskList.disableEditMode();      // re-renders task list with current names
        ganttChart.render(taskData);     // re-renders chart with final data

        editBanner.classList.remove('visible');
        editModeBtn.style.display = '';
    };

    // Callback: task bar dragged to new dates
    ganttChart.setTaskDateChange(task => {
        pendingChanges.set(task.id, {
            ...(pendingChanges.get(task.id) || {}),
            start_date: d3.timeFormat('%Y-%m-%d')(task.startDate),
            end_date:   d3.timeFormat('%Y-%m-%d')(task.endDate)
        });
    });

    // Callback: task name edited in panel
    taskList.setTaskNameChange(task => {
        pendingChanges.set(task.id, {
            ...(pendingChanges.get(task.id) || {}),
            task_name: task.name
        });
        // Update bar label in chart
        ganttChart.taskLabels.selectAll('.task-label')
            .filter(d => d.id === task.id)
            .text(function(d) {
                const barWidth = ganttChart.scaleX(d.endDate) - ganttChart.scaleX(d.startDate);
                return barWidth > 80 ? task.name : '';
            });
    });

    if (editModeBtn)   editModeBtn.addEventListener('click', enterEditMode);
    if (editCancelBtn) editCancelBtn.addEventListener('click', () => exitEditMode(false));

    if (editSaveBtn) {
        editSaveBtn.addEventListener('click', async () => {
            if (pendingChanges.size === 0) { exitEditMode(true); return; }

            editSaveBtn.textContent = 'Saving...';
            editSaveBtn.disabled = true;

            // Remove any previous error message
            const existingError = editBanner.querySelector('.edit-save-error');
            if (existingError) existingError.remove();

            try {
                for (const [taskId, changes] of pendingChanges) {
                    console.log(`Saving task ${taskId}:`, changes);
                    const resp = await fetch(`${API_URL}/tasks/${taskId}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(changes)
                    });
                    if (!resp.ok) {
                        const body = await resp.json().catch(() => ({}));
                        throw new Error(body.message || `HTTP ${resp.status}`);
                    }
                }
                // Reset button before hiding the banner so it's clean next time
                editSaveBtn.textContent = 'Save Changes';
                editSaveBtn.disabled = false;
                exitEditMode(true);
            } catch (err) {
                console.error('Save failed:', err);
                // Show error inline in the banner
                const errMsg = document.createElement('span');
                errMsg.className = 'edit-save-error';
                errMsg.textContent = `Save failed: ${err.message}`;
                editBanner.querySelector('.edit-banner-info').appendChild(errMsg);
                editSaveBtn.textContent = 'Save Changes';
                editSaveBtn.disabled = false;
            }
        });
    }

    console.log(`Interactive Gantt Chart initialised for project ${projectId}`);
});
