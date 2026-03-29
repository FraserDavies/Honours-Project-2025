// ============================================
//              Initialisation
// ============================================

// API Base URL
const API_URL = 'http://localhost:3000/api';

// Tag colour map - each tag has a fixed colour used across the chart and legend
const TAG_COLOURS = {
    research:       '#4a90d9', // blue
    planning:       '#17a2b8', // teal
    design:         '#7ed321', // green
    implementation: '#9013fe', // purple
    testing:        '#d0021b', // red
    evaluation:     '#e67e22', // orange
    writing:        '#50e3c2'  // mint
};

// Cycle detection: DFS from succId through existing dep edges.
// Returns true if adding predId → succId would form a cycle.
function wouldCreateCycle(deps, predId, succId) {
    if (predId === succId) return true; // self-loop
    // Build adjacency list: predecessorId → [successorId, ...]
    const adj = new Map();
    for (const dep of deps) {
        if (!adj.has(dep.predecessorTaskId)) adj.set(dep.predecessorTaskId, []);
        adj.get(dep.predecessorTaskId).push(dep.successorTaskId);
    }
    // DFS from succId — if we reach predId a cycle would form
    const visited = new Set();
    const stack = [succId];
    while (stack.length > 0) {
        const node = stack.pop();
        if (node === predId) return true;
        if (visited.has(node)) continue;
        visited.add(node);
        for (const neighbour of (adj.get(node) || [])) stack.push(neighbour);
    }
    return false;
}

// Sort tasks: ascending start date, then earliest end date, then task name
function sortTasks(tasks) {
    tasks.sort((a, b) => {
        if (a.startDate - b.startDate !== 0) return a.startDate - b.startDate;
        if (a.endDate - b.endDate !== 0) return a.endDate - b.endDate;
        return a.name.localeCompare(b.name);
    });
}

// Get project ID from URL query parameter
function getProjectIdFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('project');
}

// Fetch project details (including boundary dates)
async function fetchProjectBounds(projectId) {
    const parseDate = d3.timeParse('%Y-%m-%d');
    try {
        const resp = await fetch(`${API_URL}/projects/${projectId}`);
        const data = await resp.json();
        if (data.success && data.project) {
            return {
                start: data.project.start_date ? parseDate(data.project.start_date) : null,
                end:   data.project.end_date   ? parseDate(data.project.end_date)   : null
            };
        }
        return { start: null, end: null };
    } catch {
        return { start: null, end: null };
    }
}

// Fetch subtasks from database
async function fetchSubtasks(projectId) {
    try {
        const response = await fetch(`${API_URL}/projects/${projectId}/subtasks`);
        const data = await response.json();
        return data.success ? data.subtasks : [];
    } catch (error) {
        console.error('Error fetching subtasks:', error);
        return [];
    }
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
        colour: task.is_milestone === 1
            ? '#f59e0b'
            : (task.tag && TAG_COLOURS[task.tag]) ? TAG_COLOURS[task.tag] : (task.colour || '#3b82f6'),
        tag: task.tag || null,
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

    // Fetch tasks, dependencies, subtasks, and project bounds from database
    const [dbTasks, dbDependencies, dbSubtasks, projectBounds] = await Promise.all([
        fetchTasks(projectId),
        fetchDependencies(projectId),
        fetchSubtasks(projectId),
        fetchProjectBounds(projectId)
    ]);

    let projectStartDate = projectBounds.start; // null if no project bounds set
    let projectEndDate   = projectBounds.end;

    // Transform to chart format (may be empty for a brand-new project)
    const taskData = transformTaskData(dbTasks);
    sortTasks(taskData);
    const dependencyData = transformDependencyData(dbDependencies);

    // =============== SUBTASK STATE ===============
    const subtaskData    = new Map();   // taskId → subtask[] (chart-format objects)
    const expandedTasks  = new Set();   // task IDs currently expanded (default: collapsed)
    let pendingSubtaskDeletions = [];   // subtask DB IDs to DELETE on Save
    let pendingNewSubtasks      = [];   // staged for POST: { subtaskRef, parent_task_id, start_date, end_date }
    let pendingSubtaskChanges   = new Map(); // subtaskId (DB) → { subtask_name?, start_date?, end_date? }
    let subtaskSnapshot         = null; // deep copy for Cancel restore

    // Transform a DB subtask row into a chart-format object
    const parseDate = d3.timeParse('%Y-%m-%d');
    const transformSubtask = (sub) => {
        const parent = taskData.find(t => t.id === sub.parent_task_id);
        return {
            id:                 1_000_000 + sub.subtask_id,
            subtaskId:          sub.subtask_id,
            parentId:           sub.parent_task_id,
            name:               sub.subtask_name,
            progress:           sub.progress_percentage || 0,
            startDate:          parseDate(sub.start_date),
            endDate:            parseDate(sub.end_date),
            colour:             parent ? parent.colour : '#3b82f6',
            isSubtask:          true,
            isMilestone:        false,
            hasSubtasks:        false,
            isAddSubtaskMarker: false
        };
    };

    // Load subtasks into map and mark parent tasks
    dbSubtasks.forEach(sub => {
        const subObj = transformSubtask(sub);
        if (!subtaskData.has(sub.parent_task_id)) subtaskData.set(sub.parent_task_id, []);
        subtaskData.get(sub.parent_task_id).push(subObj);
    });
    taskData.forEach(t => { t.hasSubtasks = subtaskData.has(t.id); });

    // Build a flat list: tasks + expanded subtasks + add-subtask markers (edit mode)
    const buildFlatList = () => {
        const flat = [];
        for (const task of taskData) {
            flat.push(task);
            if (expandedTasks.has(task.id)) {
                const subs = subtaskData.get(task.id) || [];
                flat.push(...subs);
                if (isEditMode) {
                    flat.push({
                        id:                 2_000_000 + task.id,
                        addSubtaskFor:      task.id,
                        isAddSubtaskMarker: true,
                        isSubtask:          false,
                        isMilestone:        false,
                        hasSubtasks:        false,
                        name:               '+ Add Subtask',
                        startDate:          task.startDate,
                        endDate:            task.endDate,
                        colour:             'transparent',
                        progress:           0
                    });
                }
            }
        }
        return flat;
    };

    // Declared here so renderAll and buildFlatList can reference it without TDZ issues
    let isEditMode = false;

    // Show/hide the empty state overlay (no tasks + not in edit mode)
    const updateEmptyState = () => {
        const emptyEl = document.getElementById('ganttEmptyState');
        if (!emptyEl) return;
        const isEmpty = taskData.length === 0 && !isEditMode;
        emptyEl.style.display = isEmpty ? 'flex' : 'none';
    };

    // Re-render both the chart and task list from the flat list
    const renderAll = () => {
        const flat = buildFlatList();
        ganttChart.render(flat);
        taskList.render(flat);
        if (isEditMode) taskList.enableEditMode();
        updateEmptyState();
    };

    // Instantiate components
    const ganttChart = new GanttChart('#chartPanel', {
        rowHeight: 48,
        barHeight: 24,
        dayWidth: 35
    });

    const taskList = new TaskList('#taskList');
    const tooltip = new TooltipManager('#ganttTooltip');

    taskList.setExpandedTasks(expandedTasks);

    // Render initial data
    ganttChart.setDependencies(dependencyData);
    ganttChart.setProjectBounds(projectStartDate, projectEndDate);
    renderAll();

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
        .setItemClick(handleListClick)
        .setOnSubtaskClick((event, d) => {
            if (isEditMode) return;
            // Scroll so the subtask's start date is near the left edge
            const startX = ganttChart.scaleX(d.startDate);
            const scrollX = Math.max(0, startX - 48);
            chartScrollEl.scrollLeft = scrollX;
        });

    // Scroll to today on load
    setTimeout(() => {
        ganttChart.scrollToToday();
    }, 600);

    // Keep the day/month axis pinned to the top as the user scrolls down
    const chartScrollEl = document.getElementById('chartScroll');
    if (chartScrollEl) {
        chartScrollEl.addEventListener('scroll', () => {
            ganttChart.updateAxisScroll(chartScrollEl.scrollTop);
        });
    }

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
                const taskListWidth = 310; // matches CSS .task-list-panel width
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

                    // Date range (above centre)
                    const dateText = document.createElementNS(ns, 'text');
                    dateText.setAttribute('x', taskListWidth - 8);
                    dateText.setAttribute('y', centerY - 6);
                    dateText.setAttribute('dy', '0.35em');
                    dateText.setAttribute('text-anchor', 'end');
                    dateText.setAttribute('font-size', '9px');
                    dateText.setAttribute('font-family', 'monospace');
                    dateText.setAttribute('fill', '#6c757d');
                    dateText.textContent = `${d3.timeFormat('%d %b')(task.startDate)} - ${d3.timeFormat('%d %b')(task.endDate)}`;
                    taskListGroup.appendChild(dateText);

                    // Progress (below centre)
                    const today = new Date(); today.setHours(0, 0, 0, 0);
                    const progressFill = task.progress === 100
                        ? '#10b981'
                        : (task.progress < 100 && task.endDate < today ? '#f59e0b' : '#6c757d');
                    const progressText = document.createElementNS(ns, 'text');
                    progressText.setAttribute('x', taskListWidth - 8);
                    progressText.setAttribute('y', centerY + 6);
                    progressText.setAttribute('dy', '0.35em');
                    progressText.setAttribute('text-anchor', 'end');
                    progressText.setAttribute('font-size', '9px');
                    progressText.setAttribute('font-family', 'monospace');
                    progressText.setAttribute('font-weight', '600');
                    progressText.setAttribute('fill', progressFill);
                    progressText.textContent = `${task.progress}%`;
                    taskListGroup.appendChild(progressText);
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

                // The axis groups use updateAxisScroll(scrollTop) to stay sticky while
                // the user scrolls.  Before cloning we must reset them to scrollTop=0
                // so the axis appears at the top of the exported image, not offset.
                const exportScrollTop = chartScrollEl ? chartScrollEl.scrollTop : 0;
                if (exportScrollTop > 0) ganttChart.updateAxisScroll(0);

                // Clone all children of the chart SVG
                Array.from(chartSvg.childNodes).forEach(child => {
                    chartGroup.appendChild(child.cloneNode(true));
                });

                // Restore the live axis position
                if (exportScrollTop > 0) ganttChart.updateAxisScroll(exportScrollTop);

                // Strip edit-mode-only elements from the clone so they never appear in exports
                chartGroup.querySelectorAll(
                    '.dep-handles-layer, .dep-drag-layer, .task-resize-handle, .task-resize-indicator'
                ).forEach(el => el.remove());

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

    // =============== KANBAN MODAL ===============
    const kanbanBtn   = document.getElementById('kanbanBtn');
    const kanbanModal = document.getElementById('kanbanModal');
    const kanbanClose = document.getElementById('kanbanClose');

    const fmt3 = d3.timeFormat('%d %b');

    const renderKanbanBoard = () => {
        const board = document.getElementById('kanbanBoard');
        if (!board) return;

        const parentTasks = taskData.filter(t => !t.isSubtask && !t.isAddSubtaskMarker);

        const columns = [
            { key: 'notStarted', label: 'Not Started', accent: '#94a3b8', fill: '#94a3b8', tasks: [] },
            { key: 'inProgress', label: 'In Progress',  accent: '#f59e0b', fill: '#f59e0b', tasks: [] },
            { key: 'done',       label: 'Completed',    accent: '#22c55e', fill: '#22c55e', tasks: [] },
        ];

        parentTasks.forEach(t => {
            if (t.progress >= 100)     columns[2].tasks.push(t);
            else if (t.progress > 0)   columns[1].tasks.push(t);
            else                       columns[0].tasks.push(t);
        });

        // Determine the fill colour for a given progress value (matches column it would sit in)
        const kanbanFill = (pct) => pct >= 100 ? '#22c55e' : pct > 0 ? '#f59e0b' : '#94a3b8';

        board.innerHTML = columns.map(col => `
            <div class="kanban-col">
                <div class="kanban-col-header" style="border-bottom-color:${col.accent}">
                    <span class="kanban-col-title">${col.label}</span>
                    <span class="kanban-col-count">${col.tasks.length}</span>
                </div>
                ${col.tasks.length === 0
                    ? `<div class="kanban-empty">No tasks</div>`
                    : col.tasks.map(t => `
                        <div class="kanban-card">
                            <div class="kanban-card-top">
                                <span class="kanban-dot" style="background:${t.colour || '#3b82f6'}"></span>
                                <span class="kanban-card-name">${t.name}</span>
                            </div>
                            <div class="kanban-progress-wrap" data-task-id="${t.id}" data-fill="${col.fill}">
                                <div class="kanban-progress-bar">
                                    <div class="kanban-progress-fill"
                                         style="width:${t.progress}%;background:${col.fill}"></div>
                                </div>
                                <input type="range" class="kanban-range"
                                       min="0" max="100" step="1" value="${t.progress}">
                            </div>
                            <div class="kanban-card-meta">
                                <span class="kanban-pct">${t.progress}% complete</span>
                                <span>${fmt3(t.startDate)} - ${fmt3(t.endDate)}</span>
                            </div>
                        </div>`).join('')
                }
            </div>
        `).join('');

        // Wire each progress slider
        board.querySelectorAll('.kanban-progress-wrap').forEach(wrap => {
            const taskId = parseInt(wrap.dataset.taskId, 10);
            const range  = wrap.querySelector('.kanban-range');
            const fill   = wrap.querySelector('.kanban-progress-fill');
            const card   = wrap.closest('.kanban-card');
            const pctSpan = card ? card.querySelector('.kanban-pct') : null;

            // Live visual update while dragging
            range.addEventListener('input', () => {
                const pct = parseInt(range.value, 10);
                fill.style.width = pct + '%';
                fill.style.background = kanbanFill(pct);
                if (pctSpan) pctSpan.textContent = pct + '% complete';
            });

            // Save on release, then re-render so card moves to correct column
            range.addEventListener('change', async () => {
                const pct = parseInt(range.value, 10);
                const task = taskData.find(t => t.id === taskId);
                if (!task) return;
                task.progress = pct;
                try {
                    await fetch(`${API_URL}/tasks/${taskId}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ progress_percentage: pct })
                    });
                } catch (err) {
                    console.error('Kanban: failed to save progress:', err);
                }
                // Update the Gantt bar and task list panel progress display
                ganttChart.updateTaskProgress(taskId, pct);
                taskList.container.selectAll('.task-list-item')
                    .filter(d => d.id === taskId)
                    .select('.task-progress-input')
                    .property('value', pct);
                // Re-render the board so the card appears in its new column
                renderKanbanBoard();
            });
        });
    };

    if (kanbanBtn) {
        kanbanBtn.addEventListener('click', () => {
            renderKanbanBoard();
            kanbanModal.classList.add('visible');
        });
    }
    if (kanbanClose) {
        kanbanClose.addEventListener('click', () => kanbanModal.classList.remove('visible'));
    }
    if (kanbanModal) {
        kanbanModal.addEventListener('click', e => {
            if (e.target === kanbanModal) kanbanModal.classList.remove('visible');
        });
    }

    // =============== EDIT MODE ===============
    let pendingChanges = new Map(); // taskId -> { task_name?, start_date?, end_date? }
    let pendingDepDeletions = [];   // dep IDs marked for deletion, committed on Save
    let pendingNewTasks = [];       // new tasks staged for POST on Save (have temp negative IDs)
    let pendingNewDependencies = []; // deps involving unsaved tasks — staged for POST after those tasks are saved
    let tempIdCounter = 0;          // decrements for each new task: -1, -2, -3 …
    let saveConfirmed = false; // set to true after user acknowledges violations to allow force-save
    let taskSnapshot = null;        // full snapshot of taskData before editing
    let dependencySnapshot = null;  // snapshot of dependencyData before editing

    const editModeBtn         = document.getElementById('editModeBtn');
    const editModeBtnToolbar  = document.getElementById('editModeBtnToolbar');
    const editBanner   = document.getElementById('editModeBanner');
    const editCancelBtn = document.getElementById('editCancelBtn');
    const editSaveBtn  = document.getElementById('editSaveBtn');

    const enterEditMode = () => {
        isEditMode = true;
        pendingChanges.clear();
        pendingDepDeletions = [];
        pendingNewTasks = [];
        pendingNewDependencies = [];
        tempIdCounter = 0;
        pendingSubtaskDeletions = [];
        pendingNewSubtasks = [];
        pendingSubtaskChanges.clear();
        saveConfirmed = false;

        // Full snapshot so cancel can restore taskData exactly (including removing added tasks)
        taskSnapshot = taskData.map(t => ({ ...t, startDate: new Date(t.startDate), endDate: new Date(t.endDate) }));
        dependencySnapshot = dependencyData.map(d => ({ ...d }));
        subtaskSnapshot = new Map([...subtaskData].map(([k, v]) => [k, v.map(s => ({ ...s, startDate: new Date(s.startDate), endDate: new Date(s.endDate) }))]));

        ganttChart.enableEditMode();
        renderAll();

        editBanner.classList.add('visible');
        editModeBtn.style.display = 'none';
        if (editModeBtnToolbar) editModeBtnToolbar.style.display = 'none';
    };

    const exitEditMode = (save) => {
        if (!save) {
            // Replace taskData entirely from snapshot — this reverts edits AND removes new tasks
            if (taskSnapshot) {
                taskData.length = 0;
                taskSnapshot.forEach(t => taskData.push(t));
            }
            // Restore dependency data to snapshot
            if (dependencySnapshot) {
                dependencyData.length = 0;
                dependencySnapshot.forEach(d => dependencyData.push(d));
            }
            // Restore subtask data from snapshot
            if (subtaskSnapshot) {
                subtaskData.clear();
                subtaskSnapshot.forEach((v, k) => subtaskData.set(k, v.map(s => ({ ...s, startDate: new Date(s.startDate), endDate: new Date(s.endDate) }))));
            }
            // Re-flag hasSubtasks after restore
            taskData.forEach(t => { t.hasSubtasks = subtaskData.has(t.id); });
        }

        pendingChanges.clear();
        pendingDepDeletions = [];
        pendingNewTasks = [];
        pendingNewDependencies = [];
        pendingSubtaskDeletions = [];
        pendingNewSubtasks = [];
        pendingSubtaskChanges.clear();
        taskSnapshot = null;
        dependencySnapshot = null;
        subtaskSnapshot = null;
        saveConfirmed = false;
        isEditMode = false;

        sortTasks(taskData);
        if (addTaskPanel) addTaskPanel.classList.remove('open');
        ganttChart.disableEditMode();
        ganttChart.setDependencies(dependencyData);

        // Close progress popover if open
        const popover = document.getElementById('subtaskProgressPopover');
        if (popover) popover.classList.remove('visible');

        // Render using flat list (markers are excluded since isEditMode=false)
        taskList.editMode = false;
        const flat = buildFlatList();
        ganttChart.render(flat);
        taskList.render(flat);

        editBanner.classList.remove('visible');
        editModeBtn.style.display = '';
        if (editModeBtnToolbar) editModeBtnToolbar.style.display = '';
        if (editSaveBtn) editSaveBtn.textContent = 'Save Changes';
        updateEmptyState();
    };

    // Callback: live update of task list dates while dragging/resizing
    const fmtDate = d3.timeFormat('%d %b');
    ganttChart.setTaskDateChangeLive(task => {
        taskList.container.selectAll('.task-list-item')
            .filter(d => d.id === task.id)
            .select('.task-dates')
            .text(`${fmtDate(task.startDate)} - ${fmtDate(task.endDate)}`);
    });

    // Callback: task bar dragged/resized to new dates
    // originalDates = { originalStart, originalEnd } provided by gantt-chart.js drag end
    ganttChart.setTaskDateChange((task, originalDates) => {
        pendingChanges.set(task.id, {
            ...(pendingChanges.get(task.id) || {}),
            start_date: d3.timeFormat('%Y-%m-%d')(task.startDate),
            end_date:   d3.timeFormat('%Y-%m-%d')(task.endDate)
        });

        // Shift/clamp subtasks to follow parent task movement
        const subs = subtaskData.get(task.id);
        if (!subs || subs.length === 0 || !originalDates) return;

        const { originalStart, originalEnd } = originalDates;
        const startDelta = task.startDate - originalStart; // ms
        const endDelta   = task.endDate   - originalEnd;
        const msPerDay   = 86400000;

        // Pure move: both ends shifted by the same amount → shift subtasks by that amount.
        // Resize: clamp subtasks to stay within the new parent bounds.
        const isMove = Math.abs(startDelta - endDelta) < msPerDay / 2;

        const fmtYMD = d3.timeFormat('%Y-%m-%d');
        subs.forEach(sub => {
            if (isMove) {
                sub.startDate = new Date(sub.startDate.getTime() + startDelta);
                sub.endDate   = new Date(sub.endDate.getTime()   + startDelta);
            } else {
                // Clamp to new parent bounds
                if (sub.startDate < task.startDate) sub.startDate = new Date(task.startDate);
                if (sub.endDate   > task.endDate)   sub.endDate   = new Date(task.endDate);
                if (sub.startDate > sub.endDate)    sub.startDate = new Date(sub.endDate);
            }
            // Record the change for Save
            if (sub.subtaskId > 0) {
                pendingSubtaskChanges.set(sub.subtaskId, {
                    ...(pendingSubtaskChanges.get(sub.subtaskId) || {}),
                    start_date: fmtYMD(sub.startDate),
                    end_date:   fmtYMD(sub.endDate)
                });
            } else {
                // Temp (unsaved) subtask — update the pendingNewSubtasks entry
                const ps = pendingNewSubtasks.find(s => s.subtaskRef === sub);
                if (ps) {
                    ps.start_date = fmtYMD(sub.startDate);
                    ps.end_date   = fmtYMD(sub.endDate);
                }
            }
        });

        renderAll();
    });

    // Callback: delete button clicked on a task row
    taskList.setTaskDelete(async (task) => {
        try {
            if (task.id < 0) {
                // Unsaved (temp) task — remove from pending and in-memory state only,
                // no DB call needed.
                const pi = pendingNewTasks.findIndex(s => s.taskRef === task);
                if (pi !== -1) pendingNewTasks.splice(pi, 1);

                // Drop any pending subtasks that belong to this temp task
                for (let i = pendingNewSubtasks.length - 1; i >= 0; i--) {
                    if (pendingNewSubtasks[i].parent_task_id === task.id) {
                        pendingNewSubtasks.splice(i, 1);
                    }
                }
            } else {
                const resp = await fetch(`${API_URL}/tasks/${task.id}`, { method: 'DELETE' });
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                const result = await resp.json();
                if (!result.success) throw new Error(result.message);
            }

            // Remove from in-memory state (same for both saved and unsaved tasks)
            const idx = taskData.findIndex(t => t.id === task.id);
            if (idx !== -1) taskData.splice(idx, 1);

            subtaskData.delete(task.id);
            expandedTasks.delete(task.id);

            for (let i = dependencyData.length - 1; i >= 0; i--) {
                if (dependencyData[i].predecessorTaskId === task.id ||
                    dependencyData[i].successorTaskId   === task.id) {
                    dependencyData.splice(i, 1);
                }
            }
            for (let i = pendingNewDependencies.length - 1; i >= 0; i--) {
                if (pendingNewDependencies[i].predTaskRef.id === task.id ||
                    pendingNewDependencies[i].succTaskRef.id === task.id) {
                    pendingNewDependencies.splice(i, 1);
                }
            }

            ganttChart.setDependencies(dependencyData);
            renderAll();

        } catch (err) {
            console.error('Failed to delete task:', err);
            alert(`Failed to delete task: ${err.message}`);
        }
    });

    // Show a transient inline error in the edit banner (auto-clears after 3 s)
    const showEditError = (message) => {
        const info = editBanner.querySelector('.edit-banner-info');
        if (!info) return;
        const existing = info.querySelector('.edit-dep-error');
        if (existing) existing.remove();
        const el = document.createElement('span');
        el.className = 'edit-save-error edit-dep-error';
        el.textContent = message;
        info.appendChild(el);
        setTimeout(() => el.remove(), 3000);
    };

    // Callback: dependency drawn by dragging from one handle to another
    ganttChart.setOnDependencyCreate(async (predId, succId, type) => {
        // Ignore if this exact dependency already exists in memory
        const existingInMemory = dependencyData.find(d => d.predecessorTaskId === predId && d.successorTaskId === succId);
        if (existingInMemory) return;

        // Cycle detection: reject if adding this edge would form a loop
        if (wouldCreateCycle(dependencyData, predId, succId)) {
            showEditError('Cannot add dependency: it would create a circular dependency.');
            return;
        }

        // Rule: for finish-to-start, pred must end by succ start;
        //       for start-to-start, pred must start by succ start.
        const pred = taskData.find(t => t.id === predId);
        const succ = taskData.find(t => t.id === succId);
        const creationViolated = pred && succ && (
            type === 'start-to-start'
                ? pred.startDate > succ.startDate
                : pred.endDate > succ.startDate
        );
        if (creationViolated) {
            showEditError('Invalid dependency: predecessor must finish before successor starts.');
            return;
        }

        // If either task is unsaved (temp negative ID), don't POST to DB yet —
        // stage it and POST after the tasks are saved with real IDs.
        if (predId < 0 || succId < 0) {
            const tempDepId = --tempIdCounter; // unique temp negative ID
            dependencyData.push({
                id:                tempDepId,
                predecessorTaskId: predId,
                successorTaskId:   succId,
                dependencyType:    type
            });
            pendingNewDependencies.push({
                tempId:      tempDepId,
                predTaskRef: pred,   // live reference — .id updated to real ID on Save
                succTaskRef: succ,
                type
            });
            ganttChart.setDependencies(dependencyData);
            renderAll();
            return;
        }

        try {
            const resp = await fetch(`${API_URL}/projects/${projectId}/dependencies`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    predecessor_task_id: predId,
                    successor_task_id:   succId,
                    dependency_type:     type
                })
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const result = await resp.json();
            if (!result.success) throw new Error(result.message || 'Failed to create dependency');

            if (result.duplicate) {
                // Server says it already exists. If it was staged for deletion, un-stage it.
                const pendingIdx = pendingDepDeletions.indexOf(result.dependency_id);
                if (pendingIdx !== -1) {
                    pendingDepDeletions.splice(pendingIdx, 1);
                    dependencyData.push({
                        id:                result.dependency_id,
                        predecessorTaskId: predId,
                        successorTaskId:   succId,
                        dependencyType:    type
                    });
                }
            } else {
                dependencyData.push({
                    id:                result.dependency_id,
                    predecessorTaskId: predId,
                    successorTaskId:   succId,
                    dependencyType:    type
                });
            }

            ganttChart.setDependencies(dependencyData);
            renderAll();

        } catch (err) {
            console.error('Failed to create dependency:', err);
            alert(`Failed to create dependency: ${err.message}`);
        }
    });

    // Callback: dependency line clicked in edit mode — stage for deletion (committed on Save)
    ganttChart.setOnDependencyDelete((depId) => {
        const idx = dependencyData.findIndex(d => d.id === depId);
        if (idx !== -1) dependencyData.splice(idx, 1);

        // If it's a staged-but-unsaved dep (temp negative ID), just remove it from
        // pendingNewDependencies — no DB deletion needed.
        const newDepIdx = pendingNewDependencies.findIndex(d => d.tempId === depId);
        if (newDepIdx !== -1) {
            pendingNewDependencies.splice(newDepIdx, 1);
        } else {
            pendingDepDeletions.push(depId);
        }

        ganttChart.setDependencies(dependencyData);
        renderAll();
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

    // Callback: progress % changed in task list — immediate save (works in both view and edit mode)
    taskList.setTaskProgressChange(async (task) => {
        try {
            const resp = await fetch(`${API_URL}/tasks/${task.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ progress_percentage: task.progress })
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const result = await resp.json();
            if (!result.success) throw new Error(result.message);
            ganttChart.updateTaskProgress(task.id, task.progress);

            // If parent set to 100%, propagate to all subtasks
            if (task.progress === 100) {
                const subs = subtaskData.get(task.id) || [];
                for (const sub of subs) {
                    if (sub.progress !== 100) {
                        sub.progress = 100;
                        ganttChart.updateSubtaskProgress(sub.subtaskId, 100);
                        await fetch(`${API_URL}/subtasks/${sub.subtaskId}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ progress_percentage: 100 })
                        }).catch(() => {});
                    }
                }
                if (subs.length > 0) renderAll();
            }
        } catch (err) {
            console.error('Failed to update progress:', err);
        }
    });

    // Helper: save subtask progress immediately and sync parent if all subtasks complete
    const saveSubtaskProgress = async (subtaskId, progress) => {
        // Find the subtask in memory
        let targetSub = null, parentTask = null;
        subtaskData.forEach((subs, parentId) => {
            const found = subs.find(s => s.subtaskId === subtaskId);
            if (found) { targetSub = found; parentTask = taskData.find(t => t.id === parentId); }
        });
        if (!targetSub) return;
        targetSub.progress = progress;
        ganttChart.updateSubtaskProgress(subtaskId, progress);

        // Save to DB
        try {
            await fetch(`${API_URL}/subtasks/${subtaskId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ progress_percentage: progress })
            });
        } catch (err) {
            console.error('Failed to save subtask progress:', err);
        }

        // If all subtasks for the parent are 100%, set parent to 100%
        if (parentTask) {
            const subs = subtaskData.get(parentTask.id) || [];
            if (subs.length > 0 && subs.every(s => s.progress === 100) && parentTask.progress !== 100) {
                parentTask.progress = 100;
                ganttChart.updateTaskProgress(parentTask.id, 100);
                await fetch(`${API_URL}/tasks/${parentTask.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ progress_percentage: 100 })
                }).catch(() => {});
                renderAll();
            }
        }
    };

    // Callback: subtask progress changed in task list
    taskList.setSubtaskProgressChange(async (sub) => {
        await saveSubtaskProgress(sub.subtaskId, sub.progress);
    });

    // Callback: toggle expand/collapse for a task's subtasks
    taskList.setOnToggleExpand((taskId) => {
        if (expandedTasks.has(taskId)) expandedTasks.delete(taskId);
        else expandedTasks.add(taskId);
        renderAll();
    });

    // Callback: subtask name changed in edit mode
    taskList.setSubtaskNameChange((sub) => {
        pendingSubtaskChanges.set(sub.subtaskId, {
            ...(pendingSubtaskChanges.get(sub.subtaskId) || {}),
            subtask_name: sub.name
        });
    });

    // Callback: add subtask button clicked in edit mode
    taskList.setOnAddSubtask((parentTaskId) => {
        const parentTask = taskData.find(t => t.id === parentTaskId);
        if (!parentTask || parentTask.isMilestone) return;

        const tempSubtaskId = -(pendingNewSubtasks.length + 1); // temp negative ID
        const newSub = {
            id:                 1_000_000 + Math.abs(tempSubtaskId) + 900_000, // unique synthetic
            subtaskId:          tempSubtaskId, // temp, replaced on Save
            parentId:           parentTaskId,
            name:               'New Subtask',
            progress:           0,
            startDate:          new Date(parentTask.startDate),
            endDate:            new Date(parentTask.endDate),
            colour:             parentTask.colour,
            isSubtask:          true,
            isMilestone:        false,
            hasSubtasks:        false,
            isAddSubtaskMarker: false
        };

        if (!subtaskData.has(parentTaskId)) subtaskData.set(parentTaskId, []);
        subtaskData.get(parentTaskId).push(newSub);
        parentTask.hasSubtasks = true;
        expandedTasks.add(parentTaskId); // auto-expand so the new subtask is visible

        pendingNewSubtasks.push({
            subtaskRef:     newSub,
            parent_task_id: parentTaskId,
            start_date:     d3.timeFormat('%Y-%m-%d')(parentTask.startDate),
            end_date:       d3.timeFormat('%Y-%m-%d')(parentTask.endDate)
        });

        renderAll();
    });

    // Callback: delete subtask in edit mode (deferred until Save)
    taskList.setOnDeleteSubtask((sub) => {
        const subs = subtaskData.get(sub.parentId) || [];
        const idx = subs.findIndex(s => s.id === sub.id);
        if (idx !== -1) subs.splice(idx, 1);
        if (subs.length === 0) {
            subtaskData.delete(sub.parentId);
            const parent = taskData.find(t => t.id === sub.parentId);
            if (parent) parent.hasSubtasks = false;
        }

        if (sub.subtaskId > 0) {
            // Real DB subtask — stage for DELETE on Save
            pendingSubtaskDeletions.push(sub.subtaskId);
        } else {
            // Temp (never saved) — remove from pendingNewSubtasks
            const ni = pendingNewSubtasks.findIndex(s => s.subtaskRef === sub);
            if (ni !== -1) pendingNewSubtasks.splice(ni, 1);
        }
        renderAll();
    });

    // Progress popover for subtask bar clicks
    const subtaskPopover = document.getElementById('subtaskProgressPopover');
    if (subtaskPopover) {
        ganttChart.setOnSubtaskBarClick((subtaskId, clientX, clientY) => {
            // Find current subtask progress
            let currentProgress = 0;
            subtaskData.forEach(subs => {
                const found = subs.find(s => s.subtaskId === subtaskId);
                if (found) currentProgress = found.progress;
            });

            subtaskPopover.innerHTML = `
                <span style="font-size:0.7rem;color:var(--text-secondary);white-space:nowrap">Progress:</span>
                <input type="number" min="0" max="100" value="${currentProgress}" style="width:3em;font-family:monospace;font-size:0.75rem;border:1px solid var(--border-color);border-radius:4px;padding:1px 4px">
                <span style="font-size:0.7rem;color:var(--text-secondary)">%</span>
                <button id="popoverConfirm" style="padding:2px 6px;border:none;border-radius:4px;background:var(--primary-color);color:white;cursor:pointer;font-size:0.7rem">✓</button>
                <button id="popoverClose" style="padding:2px 6px;border:1px solid var(--border-color);border-radius:4px;background:white;cursor:pointer;font-size:0.7rem">✕</button>
            `;
            subtaskPopover.style.left = `${clientX + 8}px`;
            subtaskPopover.style.top  = `${clientY - 24}px`;
            subtaskPopover.classList.add('visible');

            const inp = subtaskPopover.querySelector('input');
            inp.focus();
            inp.select();

            document.getElementById('popoverConfirm').onclick = async () => {
                const val = Math.min(100, Math.max(0, parseInt(inp.value) || 0));
                subtaskPopover.classList.remove('visible');
                await saveSubtaskProgress(subtaskId, val);
                renderAll();
            };
            document.getElementById('popoverClose').onclick = () => {
                subtaskPopover.classList.remove('visible');
            };
            inp.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') document.getElementById('popoverConfirm').click();
                if (e.key === 'Escape') subtaskPopover.classList.remove('visible');
            });
        });

        document.addEventListener('click', (e) => {
            if (subtaskPopover.classList.contains('visible') && !subtaskPopover.contains(e.target)) {
                subtaskPopover.classList.remove('visible');
            }
        });
    }

    // =============== ADD TASK PANEL ===============
    const addTaskBtn          = document.getElementById('addTaskBtn');
    const addTaskPanel        = document.getElementById('addTaskPanel');
    const closeAddTaskPanelBtn = document.getElementById('closeAddTaskPanel');
    const newTaskNameInput    = document.getElementById('newTaskName');
    const newTaskTagSelect    = document.getElementById('newTaskTag');
    const newTaskMilestone    = document.getElementById('newTaskMilestone');
    const addTaskPreviewEl    = document.getElementById('addTaskPreview');
    const addTaskTagSwatch    = document.getElementById('addTaskTagSwatch');

    let currentTaskColour  = '#3b82f6';
    let currentIsMilestone = false;

    const getPreviewColour = () => {
        if (newTaskMilestone.checked) return '#f59e0b';
        const tag = newTaskTagSelect.value;
        return (tag && TAG_COLOURS[tag]) ? TAG_COLOURS[tag] : '#3b82f6';
    };

    const updateAddTaskPreview = () => {
        currentIsMilestone = newTaskMilestone.checked;
        currentTaskColour  = getPreviewColour();
        addTaskTagSwatch.style.background = currentTaskColour;

        if (currentIsMilestone) {
            addTaskPreviewEl.classList.add('milestone-preview');
            addTaskPreviewEl.style.background = '';
            addTaskPreviewEl.innerHTML = `<div class="milestone-preview-diamond" style="background:${currentTaskColour}"></div>
                                          <span class="add-task-preview-name">${newTaskNameInput.value.trim() || 'Milestone'}</span>`;
        } else {
            addTaskPreviewEl.classList.remove('milestone-preview');
            addTaskPreviewEl.style.background = currentTaskColour;
            addTaskPreviewEl.innerHTML = `<span class="add-task-preview-name">${newTaskNameInput.value.trim() || 'New Task'}</span>`;
        }
    };

    updateAddTaskPreview();

    newTaskNameInput.addEventListener('input', updateAddTaskPreview);
    newTaskTagSelect.addEventListener('change', updateAddTaskPreview);
    newTaskMilestone.addEventListener('change', updateAddTaskPreview);

    if (addTaskBtn) {
        addTaskBtn.addEventListener('click', () => {
            addTaskPanel.classList.toggle('open');
        });
    }

    if (closeAddTaskPanelBtn) {
        closeAddTaskPanelBtn.addEventListener('click', () => {
            addTaskPanel.classList.remove('open');
        });
    }

    // =============== DRAG NEW TASK TO CHART ===============
    let isDraggingNewTask = false;
    let addTaskGhost = null;

    addTaskPreviewEl.addEventListener('mousedown', (e) => {
        if (e.button !== 0 || !isEditMode) return;
        isDraggingNewTask = true;

        addTaskGhost = document.createElement('div');
        addTaskGhost.className = 'add-task-ghost';
        addTaskGhost.style.background = currentTaskColour;
        addTaskGhost.textContent = newTaskNameInput.value.trim() || (currentIsMilestone ? 'Milestone' : 'New Task');
        addTaskGhost.style.left = `${e.clientX - 60}px`;
        addTaskGhost.style.top  = `${e.clientY - 14}px`;
        document.body.appendChild(addTaskGhost);

        requestAnimationFrame(() => {
            if (addTaskGhost) addTaskGhost.classList.add('visible');
        });

        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDraggingNewTask || !addTaskGhost) return;
        addTaskGhost.style.left = `${e.clientX - 60}px`;
        addTaskGhost.style.top  = `${e.clientY - 14}px`;

        const rect = chartScrollEl.getBoundingClientRect();
        const over = e.clientX >= rect.left && e.clientX <= rect.right &&
                     e.clientY >= rect.top  && e.clientY <= rect.bottom;
        addTaskGhost.classList.toggle('over-chart', over);

        if (over) {
            const relX      = e.clientX - rect.left + chartScrollEl.scrollLeft;
            const relY      = e.clientY - rect.top  + chartScrollEl.scrollTop - ganttChart.margin.top;
            const startDate = d3.timeDay.round(ganttChart.scaleX.invert(relX));
            const endDate   = currentIsMilestone ? new Date(startDate) : d3.timeDay.offset(startDate, 7);
            const label     = newTaskNameInput.value.trim() || (currentIsMilestone ? 'Milestone' : 'New Task');
            ganttChart.showDropPreview(startDate, endDate, label, currentTaskColour, currentIsMilestone, relY);
        } else {
            ganttChart.hideDropPreview();
        }
    });

    document.addEventListener('mouseup', async (e) => {
        if (!isDraggingNewTask) return;
        isDraggingNewTask = false;

        if (addTaskGhost) { addTaskGhost.remove(); addTaskGhost = null; }
        ganttChart.hideDropPreview();

        if (!isEditMode || !chartScrollEl) return;

        const rect = chartScrollEl.getBoundingClientRect();
        const over = e.clientX >= rect.left && e.clientX <= rect.right &&
                     e.clientY >= rect.top  && e.clientY <= rect.bottom;
        if (!over) return;

        // Compute the dropped date from the X position within the scrollable chart
        const relX    = e.clientX - rect.left + chartScrollEl.scrollLeft;
        let startDate = d3.timeDay.round(ganttChart.scaleX.invert(relX));
        let endDate   = currentIsMilestone
            ? new Date(startDate)
            : d3.timeDay.offset(startDate, 7);

        // Clamp to project bounds so dropped tasks never land outside the timeline
        if (projectStartDate && startDate < projectStartDate) {
            startDate = new Date(projectStartDate.getTime());
            endDate   = currentIsMilestone ? new Date(startDate) : d3.timeDay.offset(startDate, 7);
        }
        if (projectEndDate && endDate > projectEndDate) {
            endDate = new Date(projectEndDate.getTime());
            if (!currentIsMilestone && startDate >= endDate) {
                startDate = d3.timeDay.offset(endDate, -7);
                if (projectStartDate && startDate < projectStartDate) startDate = new Date(projectStartDate.getTime());
            }
        }

        const taskName = newTaskNameInput.value.trim() || (currentIsMilestone ? 'Milestone' : 'New Task');
        const tag      = newTaskTagSelect.value || null;

        // Assign a temporary negative ID — replaced with the real DB ID on Save
        const tempId = --tempIdCounter;
        const newTask = {
            id:           tempId,
            name:         taskName,
            description:  '',
            startDate:    startDate,
            endDate:      endDate,
            colour:       currentTaskColour,
            tag:          tag,
            progress:     0,
            isMilestone:  currentIsMilestone,
            parentTaskId: null,
            displayOrder: taskData.length + 1
        };
        taskData.push(newTask);
        sortTasks(taskData);

        // Stage for POST on Save
        pendingNewTasks.push({
            taskRef:      newTask,          // live reference so name edits are picked up
            tempId,
            start_date:   d3.timeFormat('%Y-%m-%d')(startDate),
            end_date:     d3.timeFormat('%Y-%m-%d')(endDate),
            is_milestone: currentIsMilestone ? 1 : 0,
            tag,
            colour:       currentTaskColour
        });

        // Re-render preserving edit mode
        renderAll();

        // Reset the form for the next task
        newTaskNameInput.value   = '';
        newTaskTagSelect.value   = '';
        newTaskMilestone.checked = false;
        updateAddTaskPreview();
    });

    if (editModeBtn)         editModeBtn.addEventListener('click', enterEditMode);
    if (editModeBtnToolbar)  editModeBtnToolbar.addEventListener('click', enterEditMode);
    if (editCancelBtn) editCancelBtn.addEventListener('click', () => exitEditMode(false));

    // Empty state "Add Task" button — enter edit mode and open the add task panel
    const emptyStateAddTaskBtn = document.getElementById('emptyStateAddTaskBtn');
    if (emptyStateAddTaskBtn) {
        emptyStateAddTaskBtn.addEventListener('click', () => {
            enterEditMode();
            if (addTaskPanel) addTaskPanel.classList.add('open');
        });
    }

    // =============== TUTORIAL MODAL ===============
    const tutorialModal = document.getElementById('tutorialModal');
    const tutorialClose = document.getElementById('tutorialClose');
    const helpBtn       = document.getElementById('helpBtn');

    if (helpBtn && tutorialModal) {
        helpBtn.addEventListener('click', () => tutorialModal.classList.add('visible'));
    }
    if (tutorialClose) {
        tutorialClose.addEventListener('click', () => tutorialModal.classList.remove('visible'));
    }
    if (tutorialModal) {
        tutorialModal.addEventListener('click', (e) => {
            if (e.target === tutorialModal) tutorialModal.classList.remove('visible');
        });
    }

    // Clean the ?new=true param from the URL so refreshing doesn't re-trigger the tutorial.
    // The tutorial open/render is handled by tutorial.js which reads ?new=true during its
    // own init() — that way goToSlide(0) is called correctly and the first slide isn't blank.
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('new') === 'true') {
        history.replaceState({}, '', `${window.location.pathname}?project=${projectId}`);
    }

    // Supervisor view — hide Edit button so the chart is read-only
    const isSupervisorView = urlParams.get('role') === 'supervisor';
    if (isSupervisorView && editModeBtn) {
        editModeBtn.style.display = 'none';
        if (editModeBtnToolbar) editModeBtnToolbar.style.display = 'none';
    }

    if (editSaveBtn) {
        editSaveBtn.addEventListener('click', async () => {
            if (pendingChanges.size === 0 && pendingDepDeletions.length === 0 &&
                pendingNewTasks.length === 0 && pendingNewDependencies.length === 0 &&
                pendingSubtaskDeletions.length === 0 && pendingNewSubtasks.length === 0 && pendingSubtaskChanges.size === 0) {
                exitEditMode(true); return;
            }

            // Pre-save checks — run before any DB writes so the user can correct
            // issues first. First offence: show combined warning and block.
            // Second click ("Save Anyway") force-saves regardless.
            if (!saveConfirmed) {
                const warnings = [];

                // 1. Dependency violations
                const violated = ganttChart.getViolatedDependencies();
                if (violated.length > 0) {
                    const taskMap = new Map(taskData.map(t => [t.id, t]));
                    const names = violated.map(d => {
                        const p = taskMap.get(d.predecessorTaskId);
                        const s = taskMap.get(d.successorTaskId);
                        return p && s ? `"${p.name}" → "${s.name}"` : d.id;
                    }).join(', ');
                    warnings.push(`${violated.length} dep violation(s): ${names}`);
                }

                // 2. Project boundary violations
                if (projectStartDate || projectEndDate) {
                    const outOfBounds = taskData.filter(t => !t.isSubtask && !t.isAddSubtaskMarker && (
                        (projectStartDate && t.startDate < projectStartDate) ||
                        (projectEndDate   && t.endDate   > projectEndDate)
                    ));
                    if (outOfBounds.length > 0) {
                        const names = outOfBounds.map(t => `"${t.name}"`).join(', ');
                        warnings.push(`${outOfBounds.length} task(s) outside project bounds: ${names}`);
                    }
                }

                if (warnings.length > 0) {
                    showEditError(warnings.join(' | ') + ' — Click Save again to force save.');
                    saveConfirmed = true;
                    editSaveBtn.textContent = 'Save Anyway';
                    editSaveBtn.disabled = false;
                    return;
                }
            }
            saveConfirmed = false;

            editSaveBtn.textContent = 'Saving...';
            editSaveBtn.disabled = true;

            // Remove any previous error message
            const existingError = editBanner.querySelector('.edit-save-error');
            if (existingError) existingError.remove();

            try {
                for (const [taskId, changes] of pendingChanges) {
                    if (taskId < 0) continue; // temp ID — handled by POST below
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
                for (const depId of pendingDepDeletions) {
                    const resp = await fetch(`${API_URL}/dependencies/${depId}`, { method: 'DELETE' });
                    if (!resp.ok) {
                        const body = await resp.json().catch(() => ({}));
                        throw new Error(body.message || `HTTP ${resp.status}`);
                    }
                }
                // Process new tasks one-at-a-time, shifting each off the front after a
                // successful save.  This ensures a retry never re-POSTs already-saved tasks.
                while (pendingNewTasks.length > 0) {
                    const staged = pendingNewTasks[0];
                    const resp = await fetch(`${API_URL}/projects/${projectId}/tasks`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            task_name:    staged.taskRef.name,  // picks up any in-session renames
                            start_date:   staged.start_date,
                            end_date:     staged.end_date,
                            is_milestone: staged.is_milestone,
                            tag:          staged.tag,
                            colour:       staged.colour
                        })
                    });
                    if (!resp.ok) {
                        const body = await resp.json().catch(() => ({}));
                        throw new Error(body.message || `HTTP ${resp.status}`);
                    }
                    const result = await resp.json();
                    const realId   = result.task_id;
                    const oldTempId = staged.taskRef ? staged.taskRef.id : null;
                    // Swap the temp ID out for the real DB ID in taskData
                    if (staged.taskRef) staged.taskRef.id = realId;
                    if (oldTempId !== null) {
                        // Fix pending subtask fetch URLs
                        for (const ps of pendingNewSubtasks) {
                            if (ps.parent_task_id === oldTempId) ps.parent_task_id = realId;
                        }
                        // Re-key expandedTasks so the task stays expanded after save
                        if (expandedTasks.has(oldTempId)) {
                            expandedTasks.delete(oldTempId);
                            expandedTasks.add(realId);
                        }
                        // Re-key subtaskData and update parentId on each subtask object
                        if (subtaskData.has(oldTempId)) {
                            const subs = subtaskData.get(oldTempId);
                            subs.forEach(s => { s.parentId = realId; });
                            subtaskData.set(realId, subs);
                            subtaskData.delete(oldTempId);
                        }
                    }
                    pendingNewTasks.shift(); // remove only after success so retry skips it
                }
                // POST dependencies that were staged because one/both tasks were unsaved.
                // New task IDs are now real (updated in-place above), so use them directly.
                for (const staged of pendingNewDependencies) {
                    const predId = staged.predTaskRef.id;
                    const succId = staged.succTaskRef.id;
                    const resp = await fetch(`${API_URL}/projects/${projectId}/dependencies`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            predecessor_task_id: predId,
                            successor_task_id:   succId,
                            dependency_type:     staged.type
                        })
                    });
                    if (!resp.ok) {
                        const body = await resp.json().catch(() => ({}));
                        throw new Error(body.message || `HTTP ${resp.status}`);
                    }
                    const result = await resp.json();
                    // Replace the temp dep ID with the real one in dependencyData
                    const dep = dependencyData.find(d => d.id === staged.tempId);
                    if (dep) {
                        dep.id                = result.dependency_id;
                        dep.predecessorTaskId = predId;
                        dep.successorTaskId   = succId;
                    }
                }
                // DELETE staged subtasks
                for (const subtaskId of pendingSubtaskDeletions) {
                    const resp = await fetch(`${API_URL}/subtasks/${subtaskId}`, { method: 'DELETE' });
                    if (!resp.ok) {
                        const body = await resp.json().catch(() => ({}));
                        throw new Error(body.message || `HTTP ${resp.status}`);
                    }
                }
                // POST new subtasks — same shift-on-success pattern to prevent retry duplicates
                const fmt = d3.timeFormat('%Y-%m-%d');
                while (pendingNewSubtasks.length > 0) {
                    const staged = pendingNewSubtasks[0];
                    const resp = await fetch(`${API_URL}/tasks/${staged.parent_task_id}/subtasks`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            subtask_name: staged.subtaskRef.name,
                            start_date:   fmt(staged.subtaskRef.startDate),
                            end_date:     fmt(staged.subtaskRef.endDate)
                        })
                    });
                    if (!resp.ok) {
                        const body = await resp.json().catch(() => ({}));
                        throw new Error(body.message || `HTTP ${resp.status}`);
                    }
                    const result = await resp.json();
                    staged.subtaskRef.subtaskId = result.subtask_id;
                    staged.subtaskRef.id = 1_000_000 + result.subtask_id;
                    pendingNewSubtasks.shift(); // remove only after success
                }
                // PATCH changed subtasks (name changes; progress is saved immediately)
                for (const [subtaskId, changes] of pendingSubtaskChanges) {
                    if (subtaskId < 0) continue; // temp — handled by POST above
                    const resp = await fetch(`${API_URL}/subtasks/${subtaskId}`, {
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

    // =============== COMMENT SECTION ===============
    const commentSection = document.getElementById('commentSection');
    if (commentSection) {
        const commentListEl  = document.getElementById('commentList');
        const newCommentText = document.getElementById('newCommentText');
        const postCommentBtn = document.getElementById('postCommentBtn');

        const savedUser  = localStorage.getItem('gantt_user');
        const currentUser = savedUser ? JSON.parse(savedUser) : null;

        const formatCommentDate = (dateStr) => {
            const d = new Date(dateStr + (dateStr.includes('Z') ? '' : ' UTC'));
            return d.toLocaleString('en-GB', {
                day: '2-digit', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
        };

        const escapeHtml = (str) => str
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        const buildCommentEl = (comment, repliesMap, isReply) => {
            const el = document.createElement('div');
            el.className = isReply ? 'comment-item comment-reply-item' : 'comment-item';

            const roleLabel = comment.author_role === 'supervisor' ? '(Supervisor)' : '(Student)';
            el.innerHTML = `
                <div class="comment-header">
                    <span class="comment-author">${escapeHtml(comment.author_name)}</span>
                    <span class="comment-role">${roleLabel}</span>
                    <span class="comment-date">${formatCommentDate(comment.created_at)}</span>
                </div>
                <div class="comment-body">${escapeHtml(comment.content).replace(/\n/g, '<br>')}</div>
                ${!isReply && currentUser ? '<button class="comment-reply-btn">Reply</button>' : ''}
            `;

            if (!isReply) {
                const replies = repliesMap.get(comment.comment_id) || [];
                if (replies.length > 0) {
                    const repliesContainer = document.createElement('div');
                    repliesContainer.className = 'comment-replies';
                    replies.forEach(r => repliesContainer.appendChild(buildCommentEl(r, repliesMap, true)));
                    el.appendChild(repliesContainer);
                }

                const replyBtn = el.querySelector('.comment-reply-btn');
                if (replyBtn) {
                    replyBtn.addEventListener('click', () => {
                        const existing = el.querySelector('.reply-input-area');
                        if (existing) { existing.remove(); return; }

                        const replyArea = document.createElement('div');
                        replyArea.className = 'reply-input-area';
                        replyArea.innerHTML = `
                            <textarea class="reply-textarea" placeholder="Write a reply..." rows="2"></textarea>
                            <div class="reply-actions">
                                <button class="reply-cancel-btn">Cancel</button>
                                <button class="reply-submit-btn">Post Reply</button>
                            </div>
                        `;
                        el.appendChild(replyArea);
                        replyArea.querySelector('.reply-textarea').focus();

                        replyArea.querySelector('.reply-cancel-btn').addEventListener('click', () => replyArea.remove());
                        replyArea.querySelector('.reply-submit-btn').addEventListener('click', async () => {
                            const content = replyArea.querySelector('.reply-textarea').value.trim();
                            if (!content) return;
                            await submitComment(content, comment.comment_id);
                        });
                    });
                }
            }

            return el;
        };

        const renderComments = (comments) => {
            if (!commentListEl) return;

            if (comments.length === 0) {
                commentListEl.innerHTML = '<p class="no-comments">No comments yet.</p>';
                return;
            }

            const topLevel = comments.filter(c => !c.parent_comment_id);
            const repliesMap = new Map();
            comments.filter(c => c.parent_comment_id).forEach(c => {
                if (!repliesMap.has(c.parent_comment_id)) repliesMap.set(c.parent_comment_id, []);
                repliesMap.get(c.parent_comment_id).push(c);
            });

            commentListEl.innerHTML = '';
            topLevel.forEach(c => commentListEl.appendChild(buildCommentEl(c, repliesMap, false)));
        };

        const loadComments = async () => {
            try {
                const resp = await fetch(`${API_URL}/projects/${projectId}/comments`);
                const data = await resp.json();
                if (data.success) renderComments(data.comments || []);
            } catch (err) {
                console.error('Failed to load comments:', err);
            }
        };

        const submitComment = async (content, parentId = null) => {
            if (!currentUser) return;
            try {
                const resp = await fetch(`${API_URL}/projects/${projectId}/comments`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        parent_comment_id: parentId,
                        author_email: currentUser.email,
                        author_name:  currentUser.name,
                        author_role:  currentUser.role || 'student',
                        content
                    })
                });
                const data = await resp.json();
                if (data.success) {
                    if (!parentId && newCommentText) newCommentText.value = '';
                    await loadComments();
                }
            } catch (err) {
                console.error('Failed to post comment:', err);
            }
        };

        if (postCommentBtn) {
            if (!currentUser) {
                postCommentBtn.disabled = true;
                postCommentBtn.title = 'Log in to comment';
            } else {
                postCommentBtn.addEventListener('click', async () => {
                    const content = newCommentText ? newCommentText.value.trim() : '';
                    if (!content) return;
                    await submitComment(content);
                });
            }
        }

        loadComments();
    }

    console.log(`Interactive Gantt Chart initialised for project ${projectId}`);
});
