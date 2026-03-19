/**
 * tutorial.js - 8-slide interactive tutorial for the Gantt Chart Builder.
 *
 * Uses real GanttChart, TaskList, and TooltipManager classes (loaded globally
 * before this script). No API calls - all data is hardcoded locally.
 *
 * Slide layout: interactive demo on top, instruction text below.
 */
(function () {
    'use strict';

    // = Colour palette ============================─
    const COLOURS = {
        research:       '#4a90d9',
        design:         '#7ed321',
        implementation: '#9013fe',
        testing:        '#d0021b',
        evaluation:     '#e67e22',
        writing:        '#50e3c2',
        planning:       '#17a2b8',
    };

    // = Date helpers =============================─
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const day   = n => { const d = new Date(today); d.setDate(d.getDate() + n); return d; };

    // = Demo-data factories (fresh objects each time) =============
    function makeTasks() {
        return [
            { 
                id: 1,                          name: 'Research',    
                startDate: day(-28),            endDate: day(-14),          
                colour: COLOURS.research,       progress: 100,
                isMilestone: false,             isSubtask: false,
                hasSubtasks: false,             tag: 'research' 
            },

            { 
                id: 2,                          name: 'System Design',     
                startDate: day(-13),            endDate: day(-1),
                colour: COLOURS.design,         progress: 70,  
                isMilestone: false,             isSubtask: false,           
                hasSubtasks: false,             tag: 'design' 
            },
            { 
                id: 3,                          name: 'Implementation',  
                startDate: day(1),              endDate: day(18),
                colour: COLOURS.implementation, progress: 25,
                isMilestone: false,             isSubtask: false, 
                hasSubtasks: false,             tag: 'implementation' 
            },
            { 
                id: 4,                          name: 'Testing',         
                startDate: day(18),             endDate: day(28),
                colour: COLOURS.testing,        progress: 0,
                isMilestone: false,            isSubtask: false, 
                hasSubtasks: false,            tag: 'testing' 
            },
            { 
                id: 5,                          name: 'Launch',          
                startDate: day(28),             endDate: day(28),
                colour: COLOURS.evaluation,     progress: 0,
                isMilestone: true,             isSubtask: false, 
                hasSubtasks: false,            tag: 'evaluation' 
            },
        ];
    }

    /** Returns dependencies where some are violated (successor starts before predecessor ends). */
    function makeDeps() {
        return [
            { id: 1, predecessorTaskId: 1, successorTaskId: 2, dependencyType: 'finish-to-start' },
            { id: 2, predecessorTaskId: 2, successorTaskId: 3, dependencyType: 'finish-to-start' },
            { id: 3, predecessorTaskId: 3, successorTaskId: 4, dependencyType: 'finish-to-start' },
            { id: 4, predecessorTaskId: 4, successorTaskId: 5, dependencyType: 'finish-to-start' },
        ];
    }

    function createTutApp(demoEl, opts = {}) {
        const dayWidth = opts.dayWidth || 30;

        // = gantt-container (flex row: panel | scroll) =
        const gcEl = document.createElement('div');
        gcEl.className = 'gantt-container';
        demoEl.appendChild(gcEl);

        // = Task list panel (optional) =
        let panelEl   = null;
        let listInnerEl = null;
        let list      = null;

        if (opts.withPanel !== false) {
            panelEl = document.createElement('div');
            panelEl.className = 'task-list-panel';
            panelEl.style.width = (opts.panelWidth || 210) + 'px';

            // Header
            const headerEl = document.createElement('div');
            headerEl.className = 'task-list-header';
            headerEl.textContent = 'Tasks';
            panelEl.appendChild(headerEl);

            // Inner div - TaskList appends items here
            listInnerEl = document.createElement('div');
            panelEl.appendChild(listInnerEl);

            gcEl.appendChild(panelEl);
            list = new TaskList(listInnerEl);
        }

        // = Chart scroll area =
        const scrollEl = document.createElement('div');
        scrollEl.className = 'tut-chart-scroll';
        gcEl.appendChild(scrollEl);

        // Inner chart div - GanttChart appends SVG here
        const chartEl = document.createElement('div');
        scrollEl.appendChild(chartEl);

        // = Instantiate GanttChart =
        const gantt = new GanttChart(chartEl, { dayWidth });

        // = Tooltip =
        const tooltip = opts.withTooltip ? new TooltipManager('#ganttTooltip') : null;
        if (tooltip) {
            gantt.setTaskHover((e, d) => tooltip.show(e, d));
            gantt.setTaskOut(() => tooltip.hide());
            if (list) {
                list.itemHover = (e, d) => tooltip.show(e, d);
                list.itemOut   = () => tooltip.hide();
            }
        }

        // = Scroll sync =
        scrollEl.addEventListener('scroll', () => {
            gantt.updateAxisScroll(scrollEl.scrollTop);
            if (panelEl) panelEl.scrollTop = scrollEl.scrollTop;
        });
        if (panelEl) {
            panelEl.addEventListener('scroll', () => {
                scrollEl.scrollTop = panelEl.scrollTop;
            });
        }

        // Click task in list → scroll chart to it
        if (list) {
            list.itemClick = (e, d) => gantt.scrollToTask(d.id);
        }

        return { gantt, list, tooltip, scrollEl, panelEl, listInnerEl, gcEl };
    }

    // ======================================─
    //   SLIDE 1 - Welcome
    // ======================================─
    function renderSlide1(content) {
        content.innerHTML = `
        <div class="tut-welcome">
            <div>
                <h2 class="tut-welcome-title">Welcome to the Gantt Chart Builder</h2>
                <p class="tut-welcome-sub">This tutorial walks you through the key features of the application. Each slide includes a live, interactive example - try everything as you go. Click <strong>Next</strong> to begin.</p>
            </div>
            <div class="tut-feature-grid">
                <div class="tut-feature-card">
                    <p class="tut-feature-card-title">Visual Timeline</p>
                    <p class="tut-feature-card-desc">All tasks are shown as horizontal bars on a scrollable date timeline. Zoom in or out to adjust the level of detail.</p>
                </div>
                <div class="tut-feature-card">
                    <p class="tut-feature-card-title">Drag &amp; Drop Scheduling</p>
                    <p class="tut-feature-card-desc">In edit mode, drag bars to reschedule tasks or resize their edges to change durations.</p>
                </div>
                <div class="tut-feature-card">
                    <p class="tut-feature-card-title">Dependencies</p>
                    <p class="tut-feature-card-desc">Link tasks with dependency lines to show what must finish before the next can start. Violated constraints are highlighted in orange.</p>
                </div>
                <div class="tut-feature-card">
                    <p class="tut-feature-card-title">Subtasks</p>
                    <p class="tut-feature-card-desc">Break tasks into subtasks for finer tracking. Expand and collapse them in both the task list and the chart view.</p>
                </div>
                <div class="tut-feature-card">
                    <p class="tut-feature-card-title">Kanban Board</p>
                    <p class="tut-feature-card-desc">Switch to a Kanban view to see tasks grouped by status. (Not Started, In Progress, and Completed)</p>
                </div>
                <div class="tut-feature-card">
                    <p class="tut-feature-card-title">Export</p>
                    <p class="tut-feature-card-desc">Export your Gantt chart as a PDF or JPEG image to share with your team or include in reports.</p>
                </div>
            </div>
            <div class="tut-hint">Each of the six features above is demonstrated in its own slide. Use the dots at the bottom to jump to any slide, or click <strong>Next</strong> to proceed in order.</div>
        </div>`;
    }

    // ======================================─
    //   SLIDE 2 - Chart Layout
    // ======================================─
    function renderSlide2(content) {
        content.innerHTML = `
        <div class="tut-slide">
            <div class="gantt-toolbar">
                <div class="zoom-controls">
                    <span class="zoom-label">Zoom:</span>
                    <button class="zoom-btn" id="tut2-zoomOut" title="Zoom Out">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="11" cy="11" r="8"/>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                            <line x1="8" y1="11" x2="14" y2="11"/>
                        </svg>
                    </button>
                    <span class="zoom-level" id="tut2-zoomLevel">100%</span>
                    <button class="zoom-btn" id="tut2-zoomIn" title="Zoom In">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="11" cy="11" r="8"/>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                            <line x1="11" y1="8" x2="11" y2="14"/>
                            <line x1="8" y1="11" x2="14" y2="11"/>
                        </svg>
                    </button>
                    <button class="zoom-btn zoom-reset" id="tut2-zoomReset" title="Reset Zoom">Reset</button>
                </div>
                <div class="toolbar-right">
                    <button class="today-btn" id="tut2-today" title="Scroll to Today">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                            <line x1="16" y1="2" x2="16" y2="6"/>
                            <line x1="8" y1="2" x2="8" y2="6"/>
                            <line x1="3" y1="10" x2="21" y2="10"/>
                        </svg>
                        Today
                    </button>
                </div>
            </div>
            <div class="tut-demo" id="tut2-demo"></div>
            <div class="tut-instructions">
                <h4>Chart Layout</h4>
                <p>The <strong>task list panel</strong> on the left shows task names and progress percentages. The <strong>chart area</strong> on the right displays each task as a horizontal bar on a date axis.</p>
                <ul>
                    <li><strong>Hover</strong> over a task bar or a task name to see a tooltip with dates and progress.</li>
                    <li><strong>Zoom</strong> in and out using the buttons above.</li>
                    <li><strong>Scroll</strong> the chart horizontally to pan through time, or vertically to see more tasks.</li>
                    <li><strong>Click</strong> a task name in the left panel to jump the chart view to that task.</li>
                    <li>The vertical <span class="tut-today">blue line</span> marks today's date.</li>
                    <li> Tasks that are complete are highlighed in <span class="tut-completed">green</span>, while incomplete tasks (tasks at risk) that are past their end date are highlighted in <span class="tut-at-risk">orange</span>.</li>
                </ul>
            </div>
        </div>`;

        const tasks = makeTasks();
        const deps  = makeDeps();
        const app   = createTutApp(document.getElementById('tut2-demo'), { withTooltip: true });

        app.gantt.setDependencies(deps);
        app.gantt.render(tasks);
        if (app.list) app.list.render(tasks);
        app.gantt.scrollToToday();

        // Wire zoom buttons
        const zoomEl = document.getElementById('tut2-zoomLevel');
        const upd    = lvl => { zoomEl.textContent = lvl + '%'; };
        document.getElementById('tut2-zoomIn').onclick    = () => upd(app.gantt.zoomIn());
        document.getElementById('tut2-zoomOut').onclick   = () => upd(app.gantt.zoomOut());
        document.getElementById('tut2-zoomReset').onclick = () => upd(app.gantt.resetZoom());
        document.getElementById('tut2-today').onclick     = () => app.gantt.scrollToToday();
        upd(app.gantt.getZoomLevel());
    }

    // ======================================─
    //   SLIDE 3 - Edit Mode (Add task + Rename + Delete)
    // ======================================─
    function renderSlide3(content) {
        const TAG_COLOURS_LOCAL = {
            research: '#4a90d9', planning: '#17a2b8', design: '#7ed321',
            implementation: '#9013fe', testing: '#d0021b',
            evaluation: '#e67e22', writing: '#50e3c2',
        };

        content.innerHTML = `
        <div class="tut-slide">
            <!-- Legend strip with real Edit button -->
            <div class="tut-instructions">
                <h4>Edit Mode</h4>
                <p>At the bottom of the chart, you'll see an edit mode button. Clicking this enters edit mode</p>
            </div>
            <div class="gantt-legend" style="border-radius:8px 8px 0 0;border-bottom:none;padding:6px 16px;">
                <div class="legend-left">
                    <div class="legend-items">
                        <div class="legend-item"><div class="legend-color" style="background:#4a90d9"></div><span>Research</span></div>
                        <div class="legend-item"><div class="legend-color" style="background:#9013fe"></div><span>Implementation</span></div>
                        <div class="legend-item"><div class="legend-color" style="background:#d0021b"></div><span>Testing</span></div>
                        <div class="legend-item"><div class="legend-color" style="background:#e67e22"></div><span>Milestone</span></div>
                    </div>
                </div>
                <button class="edit-mode-btn" id="tut3-editBtn" title="Edit tasks">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                    Edit
                </button>
            </div>
            <!-- Real edit-mode-banner (hidden until Edit is clicked) -->
            <div class="edit-mode-banner" id="tut3-banner">
                <div class="edit-banner-info">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                    <span>Edit Mode - drag bars to reschedule, click names to rename</span>
                </div>
                <div class="edit-banner-actions">
                    <button class="add-task-btn" id="tut3-addTaskBtn" title="Add a new task">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <line x1="12" y1="5" x2="12" y2="19"/>
                            <line x1="5" y1="12" x2="19" y2="12"/>
                        </svg>
                        Add Task
                    </button>
                    <button class="edit-cancel-btn" id="tut3-cancel">Cancel</button>
                    <button class="edit-save-btn" id="tut3-save">Save Changes</button>
                </div>
            </div>
            <div class="tut-demo" id="tut3-demo"></div>
            <div class="tut-instructions">
                <h4>In Edit Mode you can:</h4>
                <ul>
                    <li><strong>Add a task:</strong> click <strong>Add Task</strong> to open the task panel, fill in the name, tag, and milestone toggle, then drag the preview bar onto the chart. A hologram shows where it will land.</li>
                    <li><strong>Rename a task:</strong> the task name in the left panel becomes an editable text field - click it and type a new name.</li>
                    <li><strong>Delete a task:</strong> an 
                        <strong><svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                            <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg></strong> 
                    button appears on each task row - click it to remove that task.</li>
                    <li><strong>Save Changes</strong> commits all edits. <strong>Cancel</strong> discards them.</li>
                </ul>
                <div class="tut-hint">Click <strong>Edit</strong> to activate edit mode, then click <strong>Add Task</strong> to open the new task panel and try dragging the preview bar onto the chart.</div>
            </div>
        </div>`;

        const tasks = makeTasks();
        const snapshotTasks = () => tasks.map(t => ({ ...t }));
        let snapshot = snapshotTasks();

        const app = createTutApp(document.getElementById('tut3-demo'));
        const { gantt, list, scrollEl, gcEl } = app;

        // Inject the real add-task-panel HTML inside the gantt-container
        gcEl.insertAdjacentHTML('afterbegin', `
            <div class="add-task-panel" id="tut3-addPanel">
                <div class="add-task-panel-header">
                    <span>New Task</span>
                    <button class="add-task-close" id="tut3-closePanel" title="Close">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </button>
                </div>
                <div class="add-task-fields">
                    <div class="add-task-field">
                        <label>Task Name</label>
                        <input type="text" id="tut3-taskName" placeholder="Enter task name...">
                    </div>
                    <div class="add-task-field">
                        <label>Tag</label>
                        <div class="add-task-tag-row">
                            <div class="add-task-tag-swatch" id="tut3-swatch"></div>
                            <select id="tut3-tag">
                                <option value="">No Tag</option>
                                <option value="research">Research</option>
                                <option value="planning">Planning</option>
                                <option value="design">Design</option>
                                <option value="implementation">Implementation</option>
                                <option value="testing">Testing</option>
                                <option value="evaluation">Evaluation</option>
                                <option value="writing">Writing</option>
                            </select>
                        </div>
                    </div>
                    <div class="add-task-field add-task-milestone-row">
                        <label>Milestone</label>
                        <label class="toggle-switch">
                            <input type="checkbox" id="tut3-milestone">
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                <div class="add-task-drag-area">
                    <p class="drag-hint">Drag the preview onto the chart to place</p>
                    <div class="add-task-preview" id="tut3-preview">
                        <span class="add-task-preview-name">New Task</span>
                    </div>
                </div>
            </div>`);

        // Element references
        const banner      = document.getElementById('tut3-banner');
        const editBtn     = document.getElementById('tut3-editBtn');
        const addTaskBtn  = document.getElementById('tut3-addTaskBtn');
        const cancelBtn   = document.getElementById('tut3-cancel');
        const saveBtn     = document.getElementById('tut3-save');
        const addPanel    = document.getElementById('tut3-addPanel');
        const closePanel  = document.getElementById('tut3-closePanel');
        const taskNameIn  = document.getElementById('tut3-taskName');
        const tagSel      = document.getElementById('tut3-tag');
        const swatch      = document.getElementById('tut3-swatch');
        const milestoneCk = document.getElementById('tut3-milestone');
        const previewEl   = document.getElementById('tut3-preview');

        let isEdit      = false;
        let isDragging  = false;
        let ghost       = null;
        let nextId      = 200;
        let currentColour = '#3b82f6';

        function getPreviewColour() {
            if (milestoneCk.checked) return '#f59e0b';
            return TAG_COLOURS_LOCAL[tagSel.value] || '#3b82f6';
        }

        function updatePreview() {
            currentColour = getPreviewColour();
            swatch.style.background = currentColour;
            const name = taskNameIn.value.trim() || (milestoneCk.checked ? 'Milestone' : 'New Task');
            if (milestoneCk.checked) {
                previewEl.classList.add('milestone-preview');
                previewEl.style.background = '';
                previewEl.innerHTML = `<div class="milestone-preview-diamond" style="background:${currentColour}"></div>
                                       <span class="add-task-preview-name">${name}</span>`;
            } else {
                previewEl.classList.remove('milestone-preview');
                previewEl.style.background = currentColour;
                previewEl.innerHTML = `<span class="add-task-preview-name">${name}</span>`;
            }
        }

        function rerender() {
            gantt.setDependencies([]);
            gantt.render(tasks);
            if (list) {
                list.render(tasks);
                if (isEdit) list.enableEditMode();
            }
        }

        function enterEdit() {
            snapshot = snapshotTasks();
            isEdit = true;
            editBtn.style.display = 'none';
            banner.classList.add('visible');
            gantt.enableEditMode();
            list.render(tasks);
            list.enableEditMode();
            list.onTaskDelete = (d) => {
                const idx = tasks.findIndex(t => t.id === d.id);
                if (idx !== -1) tasks.splice(idx, 1);
                rerender();
            };
            updatePreview();
        }

        function exitEdit(restore) {
            isEdit = false;
            editBtn.style.display = '';
            banner.classList.remove('visible');
            addPanel.classList.remove('open');
            gantt.disableEditMode();
            if (restore) {
                tasks.length = 0;
                snapshot.forEach(t => tasks.push(t));
            }
            list.onTaskDelete = () => {};
            gantt.setDependencies([]);
            gantt.render(tasks);
            list.render(tasks);
        }

        editBtn.onclick     = enterEdit;
        cancelBtn.onclick   = () => exitEdit(true);
        saveBtn.onclick     = () => exitEdit(false);
        addTaskBtn.onclick  = () => addPanel.classList.toggle('open');
        closePanel.onclick  = () => addPanel.classList.remove('open');
        tagSel.addEventListener('change', updatePreview);
        milestoneCk.addEventListener('change', updatePreview);
        taskNameIn.addEventListener('input', updatePreview);

        // = Drag from add-task-preview onto chart =
        const onMove = (e) => {
            if (!isDragging || !ghost) return;
            ghost.style.left = (e.clientX - 60) + 'px';
            ghost.style.top  = (e.clientY - 14) + 'px';

            const rect = scrollEl.getBoundingClientRect();
            const over = e.clientX >= rect.left && e.clientX <= rect.right &&
                         e.clientY >= rect.top  && e.clientY <= rect.bottom;
            ghost.classList.toggle('over-chart', over);

            if (over && isEdit) {
                const relX = e.clientX - rect.left + scrollEl.scrollLeft;
                const relY = e.clientY - rect.top  + scrollEl.scrollTop - gantt.margin.top;
                const sd   = d3.timeDay.round(gantt.scaleX.invert(relX));
                const ed   = milestoneCk.checked ? sd : d3.timeDay.offset(sd, 7);
                const name = taskNameIn.value.trim() || (milestoneCk.checked ? 'Milestone' : 'New Task');
                gantt.showDropPreview(sd, ed, name, currentColour, milestoneCk.checked, relY);
            } else {
                gantt.hideDropPreview();
            }
        };

        const onUp = (e) => {
            if (!isDragging) return;
            isDragging = false;
            if (ghost) { ghost.remove(); ghost = null; }
            gantt.hideDropPreview();
            if (!isEdit) return;

            const rect = scrollEl.getBoundingClientRect();
            const over = e.clientX >= rect.left && e.clientX <= rect.right &&
                         e.clientY >= rect.top  && e.clientY <= rect.bottom;
            if (!over) return;

            const relX    = e.clientX - rect.left + scrollEl.scrollLeft;
            const isMile  = milestoneCk.checked;
            const sd      = d3.timeDay.round(gantt.scaleX.invert(relX));
            const ed      = isMile ? sd : d3.timeDay.offset(sd, 7);
            const name    = taskNameIn.value.trim() || (isMile ? 'Milestone' : 'New Task');
            const newTask = {
                id: nextId++, name, startDate: sd, endDate: ed,
                colour: currentColour, progress: 0, tag: tagSel.value || undefined,
                isMilestone: isMile, isSubtask: false, hasSubtasks: false,
            };
            tasks.push(newTask);
            tasks.sort((a, b) => a.startDate - b.startDate || a.endDate - b.endDate || a.name.localeCompare(b.name));
            rerender();
            addPanel.classList.remove('open');
        };

        previewEl.addEventListener('mousedown', (e) => {
            if (e.button !== 0 || !isEdit) return;
            isDragging = true;
            ghost = document.createElement('div');
            ghost.className = 'add-task-ghost';
            ghost.style.background = currentColour;
            ghost.textContent = taskNameIn.value.trim() || (milestoneCk.checked ? 'Milestone' : 'New Task');
            ghost.style.left = (e.clientX - 60) + 'px';
            ghost.style.top  = (e.clientY - 14) + 'px';
            document.body.appendChild(ghost);
            requestAnimationFrame(() => { if (ghost) ghost.classList.add('visible'); });
            e.preventDefault();
        });

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup',   onUp);

        // Initial render
        gantt.setDependencies([]);
        gantt.render(tasks);
        if (list) list.render(tasks);
        gantt.scrollToToday();

        return () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup',   onUp);
            if (ghost) { ghost.remove(); ghost = null; }
            if (isEdit) gantt.disableEditMode();
        };
    }

    // ======================================─
    //   SLIDE 4 - Moving & Resizing
    // ======================================─
    function renderSlide4(content) {
        content.innerHTML = `
        <div class="tut-slide">
            <div class="tut-edit-banner">
                <span>Edit mode is active - drag bars to move, drag edges to resize</span>
            </div>
            <div class="tut-demo" id="tut4-demo"></div>
            <div class="tut-instructions">
                <h4>Moving and Resizing Tasks</h4>
                <p>In edit mode you can reschedule tasks directly on the chart without having to type dates:</p>
                <ul>
                    <li><strong>Drag a task bar</strong> left or right to move the entire task to a new date. Both the start and end dates shift together, keeping the duration the same.</li>
                    <li>Resize grip indicators (thin vertical marks) appear at each edge - hover over a bar edge to see them highlight.
                        <ul>
                            <li><strong>Drag the left edge</strong> of a bar to change only the <em>start date</em>, making the task longer or shorter.</li>
                            <li><strong>Drag the right edge</strong> of a bar to change only the <em>end date</em>.</li>
                        </ul>
                    </li>    
                </ul>
                <div class="tut-hint">Hover over a bar to see the resize handles appear at each edge, then drag one to change the task duration.</div>
            </div>
        </div>`;

        // Use only non-milestone tasks so resize handles are visible on all bars
        const tasks = makeTasks().filter(t => !t.isMilestone);
        const app   = createTutApp(document.getElementById('tut4-demo'), { withPanel: true });

        app.gantt.setDependencies([]);
        app.gantt.render(tasks);
        if (app.list) app.list.render(tasks);
        app.gantt.scrollToToday();
        app.gantt.enableEditMode();
        if (app.list) app.list.enableEditMode();

        // Live date feedback in panel while dragging
        app.gantt.onTaskDateChangeLive = () => {
            if (app.list) app.list.render(tasks);
            if (app.list) app.list.enableEditMode();
        };

        return () => {
            app.gantt.disableEditMode();
        };
    }

    // ======================================─
    //   SLIDE 5 - Dependencies
    // ======================================─
    function renderSlide5(content) {
        content.innerHTML = `
        <div class="tut-slide">
            <div class="tut-edit-banner">
                <span id="tut5-status">Edit mode active - hover a task bar to see dependency handles</span>
                <div class="tut-edit-banner-actions">
                    <button class="tut-btn tut-btn--primary" id="tut5-toggle">Disable Edit Mode</button>
                </div>
            </div>
            <div class="tut-demo" id="tut5-demo"></div>
            <div class="tut-instructions">
                <h4>Dependencies</h4>
                <p>Dependency lines show which tasks must finish before others can begin.</p>
                <ul>
                    <li><span class="tut-dep-line-valid"></span> <strong>Black lines</strong> are valid dependencies where the successor starts after the predecessor finishes.</li>
                    <li><span class="tut-dep-line-violated"></span> <strong>Orange dashed lines</strong> are violated - the successor starts before the predecessor finishes. Notice that "Implementation" overlaps "System Design" in the example above.</li>
                    <li><strong>Draw a dependency:</strong> in edit mode, hover over a task bar - small circles appear at each end. Drag from one circle to another task's circle.</li>
                    <li><strong>Delete a dependency:</strong> in edit mode, click any dependency line to remove it.</li>
                </ul>

                <div class="tut-hint">Begin by hovering over then clicking a dependency line to delete it. After deleting, drag from one circle to another to create a new dependency line.</div>
            </div>
        </div>`;

        const tasks     = makeTasks();
        // Move Implementation to day(-2) so its dependency on System Design (ends day(-1)) is violated
        const implTask = tasks.find(t => t.id === 3);
        if (implTask) implTask.startDate = day(-2);
        const deps      = makeDeps();
        let isEdit      = true;
        let nextDepId   = 100;

        const app = createTutApp(document.getElementById('tut5-demo'), { withPanel: true });
        app.gantt.setDependencies(deps);
        app.gantt.render(tasks);
        if (app.list) { app.list.render(tasks); app.list.enableEditMode(); }
        app.gantt.scrollToToday();
        app.gantt.enableEditMode();

        app.gantt.setOnDependencyCreate((predId, succId) => {
            if (deps.some(d => d.predecessorTaskId === predId && d.successorTaskId === succId)) return;
            deps.push({ id: nextDepId++, predecessorTaskId: predId, successorTaskId: succId, dependencyType: 'finish-to-start' });
            app.gantt.setDependencies(deps);
            app.gantt.render(tasks);
        });

        app.gantt.setOnDependencyDelete((depId) => {
            const idx = deps.findIndex(d => d.id === depId);
            if (idx !== -1) deps.splice(idx, 1);
            app.gantt.setDependencies(deps);
            app.gantt.render(tasks);
        });

        const toggleBtn = document.getElementById('tut5-toggle');
        const statusEl  = document.getElementById('tut5-status');

        toggleBtn.onclick = () => {
            isEdit = !isEdit;
            if (isEdit) {
                app.gantt.enableEditMode();
                if (app.list) { app.list.render(tasks); app.list.enableEditMode(); }
                toggleBtn.textContent = 'Disable Edit Mode';
                statusEl.textContent  = 'Edit mode active - hover a task bar to see dependency handles';
            } else {
                app.gantt.disableEditMode();
                if (app.list) { app.list.render(tasks); }
                toggleBtn.textContent = 'Enable Edit Mode';
                statusEl.textContent  = 'View mode - enable edit mode to draw or delete dependencies';
            }
        };

        return () => {
            if (isEdit) app.gantt.disableEditMode();
        };
    }

    // ======================================─
    //   SLIDE 6 - Subtasks
    // ======================================─
    function renderSlide6(content) {
        content.innerHTML = `
        <div class="tut-slide">
            <div class="tut-edit-banner">
                <span id="tut6-status">View mode - click &#9654; chevrons to expand subtasks</span>
                <div class="tut-edit-banner-actions">
                    <button class="tut-btn tut-btn--primary" id="tut6-toggle">Enable Edit Mode</button>
                </div>
            </div>
            <div class="tut-demo" id="tut6-demo"></div>
            <div class="tut-instructions">
                <h4>Subtasks</h4>
                <p>Tasks can be broken into subtasks for finer-grained tracking.</p>
                <ul>
                    <li>Tasks that have subtasks show a <strong>&#9654; chevron</strong>, click it to expand or collapse the subtask rows.</li>
                    <li>Subtasks appear as <strong>smaller, slightly faded bars</strong> on the chart and inherit their parent's colour.</li>
                    <li>In <strong>edit mode</strong>, click the <strong>+ Add Subtask</strong> row (below the subtasks) or the <strong>+</strong> button on a task row to instantly add a new subtask - then rename it in place.</li>
                    <li>Delete a subtask using the <strong>x</strong> button that appears on each subtask row in edit mode.</li>
                </ul>
                <div class="tut-hint">Enable edit mode, expand a task with the &#9654; chevron, then click <strong>+ Add Subtask</strong> to add one - a "New Subtask" row appears ready to rename.</div>
            </div>
        </div>`;

        let isEdit    = false;
        let nextSubId = 1_000_100;

        const tasks    = makeTasks();
        const implTask = tasks.find(t => t.id === 3);
        const testTask = tasks.find(t => t.id === 4);
        implTask.hasSubtasks = true;
        testTask.hasSubtasks = true;

        // Pre-populate subtasks spanning their parent's full dates
        const subtaskData = new Map();
        subtaskData.set(3, [
            { id: 1_000_001, parentId: 3, name: 'Backend API',
              startDate: new Date(implTask.startDate), endDate: new Date(implTask.endDate),
              colour: COLOURS.implementation, progress: 40,
              isSubtask: true, isMilestone: false, hasSubtasks: false, isAddSubtaskMarker: false },
            { id: 1_000_002, parentId: 3, name: 'Frontend UI',
              startDate: new Date(implTask.startDate), endDate: new Date(implTask.endDate),
              colour: COLOURS.implementation, progress: 10,
              isSubtask: true, isMilestone: false, hasSubtasks: false, isAddSubtaskMarker: false },
        ]);
        subtaskData.set(4, [
            { id: 1_000_003, parentId: 4, name: 'Unit Tests',
              startDate: new Date(testTask.startDate), endDate: new Date(testTask.endDate),
              colour: COLOURS.testing, progress: 0,
              isSubtask: true, isMilestone: false, hasSubtasks: false, isAddSubtaskMarker: false },
            { id: 1_000_004, parentId: 4, name: 'Integration',
              startDate: new Date(testTask.startDate), endDate: new Date(testTask.endDate),
              colour: COLOURS.testing, progress: 0,
              isSubtask: true, isMilestone: false, hasSubtasks: false, isAddSubtaskMarker: false },
        ]);

        const expandedTasks = new Set();

        // Copied exactly from interactive-chart.js
        const buildFlatList = () => {
            const flat = [];
            for (const task of tasks) {
                flat.push(task);
                if (expandedTasks.has(task.id)) {
                    const subs = subtaskData.get(task.id) || [];
                    flat.push(...subs);
                    if (isEdit) {
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
                            progress:           0,
                        });
                    }
                }
            }
            return flat;
        };

        const app = createTutApp(document.getElementById('tut6-demo'), { withPanel: true, panelWidth: 330 });
        if (app.list) app.list.expandedTasks = expandedTasks;

        // Wire callbacks exactly as in interactive-chart.js (set once, looked up at click time)
        app.list.setOnToggleExpand(taskId => {
            if (expandedTasks.has(taskId)) expandedTasks.delete(taskId);
            else expandedTasks.add(taskId);
            renderAll();
        });

        app.list.setOnAddSubtask(parentTaskId => {
            const parent = tasks.find(t => t.id === parentTaskId);
            if (!parent) return;
            const newSub = {
                id:                 nextSubId++,
                parentId:           parentTaskId,
                name:               'New Subtask',
                startDate:          new Date(parent.startDate),
                endDate:            new Date(parent.endDate),
                colour:             parent.colour,
                progress:           0,
                isSubtask:          true,
                isMilestone:        false,
                hasSubtasks:        false,
                isAddSubtaskMarker: false,
            };
            if (!subtaskData.has(parentTaskId)) subtaskData.set(parentTaskId, []);
            subtaskData.get(parentTaskId).push(newSub);
            parent.hasSubtasks = true;
            expandedTasks.add(parentTaskId);
            renderAll(); // enableEditMode() runs inside → name input appears ready to type
        });

        app.list.setOnDeleteSubtask(sub => {
            const subs = subtaskData.get(sub.parentId) || [];
            const idx = subs.findIndex(s => s.id === sub.id);
            if (idx !== -1) subs.splice(idx, 1);
            if (subs.length === 0) {
                subtaskData.delete(sub.parentId);
                const parent = tasks.find(t => t.id === sub.parentId);
                if (parent) parent.hasSubtasks = false;
            }
            renderAll();
        });

        function renderAll() {
            const flat = buildFlatList();
            app.gantt.setDependencies([]);
            app.gantt.render(flat);
            app.list.render(flat);
            if (isEdit) app.list.enableEditMode();
        }

        const toggleBtn = document.getElementById('tut6-toggle');
        const statusEl  = document.getElementById('tut6-status');

        toggleBtn.onclick = () => {
            isEdit = !isEdit;
            if (isEdit) {
                app.gantt.enableEditMode();
                toggleBtn.textContent = 'Disable Edit Mode';
                statusEl.textContent  = 'Edit mode - expand a task then click + Add Subtask';
            } else {
                app.gantt.disableEditMode();
                toggleBtn.textContent = 'Enable Edit Mode';
                statusEl.textContent  = 'View mode - click &#9654; chevrons to expand subtasks';
            }
            renderAll();
        };

        renderAll();
        app.gantt.scrollToToday();

        return () => { if (isEdit) app.gantt.disableEditMode(); };
    }

    // ======================================─
    //   SLIDE 7 - Progress & Kanban
    // ======================================─
    function renderSlide7(content) {
        const fmtCard = d3.timeFormat('%d %b');

        content.innerHTML = `
        <div class="tut-slide">
            <div class="tut-demo" id="tut7-demo"></div>
            <div class="tut-instructions">
                <h4>Progress Tracking &amp; Kanban View</h4>
                <p>Each task has a progress percentage (0-100%). You can update it in two places:</p>
                <ul>
                    <li><strong>Task list panel:</strong> type directly into the progress number box on any task row - the Gantt bar and the Kanban card update immediately.</li>
                    <li><strong>Kanban board (below):</strong> drag the slider on a Kanban card - the bar on the chart and the task list update too.</li>
                </ul>
                <p>The Kanban board automatically sorts tasks into <strong>Not Started</strong>, <strong>In Progress</strong>, and <strong>Completed</strong> columns based on their progress value.</p>
            </div>
            <div style="border:1px solid var(--border-color);border-radius:8px;overflow:hidden">
                <div style="padding:8px 14px;border-bottom:1px solid var(--border-color);background:var(--bg-gray);font-size:0.85rem;font-weight:600;color:var(--text-primary)">
                    Kanban Board
                </div>
                <div class="tut-kanban-wrapper">
                    <div class="kanban-board" id="tut7-kanban" style="height:auto;padding:0;overflow:visible"></div>
                </div>
            </div>
        </div>`;

        // Only non-milestone tasks for kanban
        const tasks = makeTasks().filter(t => !t.isMilestone);
        const app   = createTutApp(document.getElementById('tut7-demo'), { withPanel: true });

        const kanbanFill = pct => pct >= 100 ? '#22c55e' : pct > 0 ? '#f59e0b' : '#94a3b8';

        function renderKanban() {
            const board = document.getElementById('tut7-kanban');
            if (!board) return;

            const cols = [
                { label: 'Not Started', accent: '#94a3b8', tasks: [] },
                { label: 'In Progress',  accent: '#f59e0b', tasks: [] },
                { label: 'Completed',    accent: '#22c55e', tasks: [] },
            ];
            tasks.forEach(t => {
                if (t.progress >= 100)   cols[2].tasks.push(t);
                else if (t.progress > 0) cols[1].tasks.push(t);
                else                     cols[0].tasks.push(t);
            });

            board.innerHTML = cols.map(col => `
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
                                    <span class="kanban-dot" style="background:${t.colour}"></span>
                                    <span class="kanban-card-name">${t.name}</span>
                                </div>
                                <div class="kanban-progress-wrap" data-task-id="${t.id}">
                                    <div class="kanban-progress-bar">
                                        <div class="kanban-progress-fill"
                                             style="width:${t.progress}%;background:${col.accent}"></div>
                                    </div>
                                    <input type="range" class="kanban-range"
                                           min="0" max="100" step="1" value="${t.progress}">
                                </div>
                                <div class="kanban-card-meta">
                                    <span class="kanban-pct">${t.progress}% complete</span>
                                    <span>${fmtCard(t.startDate)} - ${fmtCard(t.endDate)}</span>
                                </div>
                            </div>`).join('')
                    }
                </div>`).join('');

            // Wire kanban sliders
            board.querySelectorAll('.kanban-progress-wrap').forEach(wrap => {
                const taskId  = parseInt(wrap.dataset.taskId, 10);
                const range   = wrap.querySelector('.kanban-range');
                const fill    = wrap.querySelector('.kanban-progress-fill');
                const pctSpan = wrap.closest('.kanban-card')?.querySelector('.kanban-pct');

                range.addEventListener('input', () => {
                    const pct = parseInt(range.value, 10);
                    fill.style.width      = pct + '%';
                    fill.style.background = kanbanFill(pct);
                    if (pctSpan) pctSpan.textContent = pct + '% complete';
                });

                range.addEventListener('change', () => {
                    const pct = parseInt(range.value, 10);
                    const t   = tasks.find(t => t.id === taskId);
                    if (!t) return;
                    t.progress = pct;
                    app.gantt.updateTaskProgress(taskId, pct);
                    // Sync progress input in task list panel
                    if (app.list) {
                        app.list.container.selectAll('.task-list-item')
                            .filter(d => d.id === taskId)
                            .select('.task-progress-input')
                            .property('value', pct);
                    }
                    renderKanban();
                });
            });
        }

        // Wire progress input in task list → update Gantt bar + kanban
        if (app.list) {
            app.list.onTaskProgressChange = (d) => {
                app.gantt.updateTaskProgress(d.id, d.progress);
                renderKanban();
            };
        }

        app.gantt.setDependencies([]);
        app.gantt.render(tasks);
        if (app.list) app.list.render(tasks);
        app.gantt.scrollToToday();
        renderKanban();
    }

    // ======================================─
    //   SLIDE 8 - Export
    // ======================================─
    function renderSlide8(content) {
        content.innerHTML = `
        <div class="tut-slide">
            <div class="tut-instructions">
                <h4>Exporting Your Chart</h4>
                <p>When your chart is ready to share, use the <strong>Export</strong> button in the toolbar at the top of the chart page to open the export options.</p>
            </div>
            <div class="tut-export-grid">
                <div class="tut-export-card">
                    <p class="tut-export-card-title">Export as PDF</p>
                    <p class="tut-export-card-desc">Generates a printable PDF document containing the full Gantt chart, including all tasks, bars, dependency lines, and the date axis. Ideal for attaching to reports or printing.</p>
                </div>
                <div class="tut-export-card">
                    <p class="tut-export-card-title">Export as JPEG</p>
                    <p class="tut-export-card-desc">Saves a high-quality JPEG image of the chart exactly as it appears on screen. Useful for embedding in presentations or sharing via email or messaging apps.</p>
                </div>
            </div>
            <div class="tut-instructions" style="margin-top:4px">
                <ul>
                    <li>The export captures the chart at the <strong>current zoom level</strong> - zoom out before exporting if you want to fit all tasks on one page.</li>
                    <li>Both formats include task colours, progress fills, and dependency lines.</li>
                </ul>
            </div>
            <div class="tut-hint">The Export button is in the top-right of the chart toolbar, next to the Kanban and Today buttons. Click it to open the format selection dialog.</div>
            <div class="tut-instructions" style="margin-top:12px">
                <h4>You are ready to go!</h4>
                <p>That covers all the main features. Close this tutorial and start building your project. You can reopen it at any time by clicking the <strong>?</strong> help button in the toolbar.</p>
            </div>
        </div>`;
    }

    // = Slides array =============================─
    const SLIDES = [
        { title: 'Welcome',           body: renderSlide1 },
        { title: 'Chart Layout',      body: renderSlide2 },
        { title: 'Edit Mode',         body: renderSlide3 },
        { title: 'Moving & Resizing', body: renderSlide4 },
        { title: 'Dependencies',      body: renderSlide5 },
        { title: 'Subtasks',          body: renderSlide6 },
        { title: 'Progress & Kanban', body: renderSlide7 },
        { title: 'Exporting',         body: renderSlide8 },
    ];

    // = Navigation state ===========================
    let currentSlide = 0;
    let slideCleanup = () => {};

    function goToSlide(idx) {
        // Run cleanup from the slide we are leaving
        try { slideCleanup(); } catch (e) { console.warn('[tutorial] cleanup error:', e); }
        slideCleanup = () => {};
        currentSlide = idx;

        const counter = document.getElementById('tutorialCounter');
        const titleEl = document.getElementById('tutorialTitle');
        const content = document.getElementById('tutorialContent');
        const prevBtn = document.getElementById('tutorialPrev');
        const nextBtn = document.getElementById('tutorialNext');
        const dotsEl  = document.getElementById('tutorialDots');

        if (counter) counter.textContent = `${idx + 1} / ${SLIDES.length}`;
        if (titleEl) titleEl.textContent = SLIDES[idx].title;
        if (content) content.innerHTML   = '';
        if (prevBtn) prevBtn.disabled    = (idx === 0);
        if (nextBtn) nextBtn.textContent = (idx === SLIDES.length - 1) ? 'Finish' : 'Next';

        // Update dot indicators
        if (dotsEl) {
            dotsEl.querySelectorAll('.tutorial-dot').forEach((dot, i) => {
                dot.classList.toggle('active', i === idx);
            });
        }

        const cleanup = SLIDES[idx].body(content);
        if (typeof cleanup === 'function') slideCleanup = cleanup;
    }

    // = Init =================================
    function init() {
        const modal   = document.getElementById('tutorialModal');
        const closeBtn = document.getElementById('tutorialClose');
        const prevBtn  = document.getElementById('tutorialPrev');
        const nextBtn  = document.getElementById('tutorialNext');
        const dotsEl   = document.getElementById('tutorialDots');
        const helpBtn  = document.getElementById('helpBtn');

        if (!modal) return;

        // Build navigation dots
        if (dotsEl) {
            dotsEl.innerHTML = '';
            SLIDES.forEach((slide, i) => {
                const dot = document.createElement('button');
                dot.className = 'tutorial-dot' + (i === 0 ? ' active' : '');
                dot.title = slide.title;
                dot.addEventListener('click', () => goToSlide(i));
                dotsEl.appendChild(dot);
            });
        }

        function openTutorial() {
            modal.classList.add('visible');
            goToSlide(0);
        }

        function closeTutorial() {
            try { slideCleanup(); } catch (e) {}
            slideCleanup = () => {};
            modal.classList.remove('visible');
        }

        if (closeBtn) closeBtn.addEventListener('click', closeTutorial);
        if (helpBtn)  helpBtn.addEventListener('click',  openTutorial);

        // Close on overlay backdrop click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeTutorial();
        });

        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                if (currentSlide > 0) goToSlide(currentSlide - 1);
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                if (currentSlide < SLIDES.length - 1) {
                    goToSlide(currentSlide + 1);
                } else {
                    closeTutorial();
                }
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
