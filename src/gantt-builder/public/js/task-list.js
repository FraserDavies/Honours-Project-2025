// TaskList Class
// Renders the task names on the left panel
class TaskList {
    container;
    data;
    itemHover = () => {};
    itemOut = () => {};
    itemClick = () => {};
    editMode = false;
    expandedTasks = null; // reference to Set from interactive-chart.js

    // Callbacks
    onTaskNameChange = () => {};
    onTaskDelete = () => {};
    onTaskProgressChange = () => {};
    onToggleExpand = () => {};
    onSubtaskProgressChange = () => {};
    onAddSubtask = () => {};
    onDeleteSubtask = () => {};
    onSubtaskNameChange = () => {};
    onSubtaskClick = () => {};

    constructor(container) {
        this.container = d3.select(container);
        this.data = [];
    }

    render(taskData) {
        this.data = taskData || [];
        const self = this;
        const fmt = d3.timeFormat('%d %b');
        const today = new Date(); today.setHours(0, 0, 0, 0);

        const progressColor = (progress, endDate) => progress === 100
            ? '#10b981'
            : (progress < 100 && endDate < today ? '#f59e0b' : 'var(--text-secondary)');

        const buildHtml = d => {
            if (d.isAddSubtaskMarker) {
                return `<span class="add-subtask-icon">+</span><span class="add-subtask-label">Add Subtask</span>`;
            }

            if (d.isSubtask) {
                const col = progressColor(d.progress, d.endDate);
                return `
                    <button class="subtask-delete-btn" title="Delete subtask">
                        <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </button>
                    <span class="subtask-color-dot" style="background: ${d.colour || '#3b82f6'}"></span>
                    <span class="subtask-name">${d.name}</span>
                    <span class="task-progress"><input type="number" class="task-progress-input" min="0" max="100" value="${d.progress}" style="color:${col}" title="Progress %"><span class="task-progress-pct" style="color:${col}">%</span></span>
                `;
            }

            // Regular task
            const indicator = d.isMilestone
                ? `<div class="task-color-diamond" style="background: ${d.colour || '#f59e0b'}"></div>`
                : `<div class="task-color-dot" style="background: ${d.colour || '#3b82f6'}"></div>`;
            const col = progressColor(d.progress, d.endDate);
            const isExpanded = self.expandedTasks && self.expandedTasks.has(d.id);
            const chevron = d.hasSubtasks
                ? `<span class="task-chevron${isExpanded ? ' expanded' : ''}" title="${isExpanded ? 'Collapse subtasks' : 'Expand subtasks'}">&#9654;</span>`
                : '';
            return `
                <button class="task-delete-btn" title="Delete task">
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
                ${chevron}
                ${indicator}
                <span class="task-name">${d.name}</span>
                <span class="task-dates">${fmt(d.startDate)} - ${fmt(d.endDate)}</span>
                <span class="task-progress"><input type="number" class="task-progress-input" min="0" max="100" value="${d.progress}" style="color:${col}" title="Progress %"><span class="task-progress-pct" style="color:${col}">%</span></span>
                ${!d.isMilestone ? `<button class="task-add-subtask-btn" title="Add subtask">+</button>` : ''}
            `;
        };

        const getClass = d => {
            if (d.isAddSubtaskMarker) return 'task-list-item add-subtask-marker-row';
            if (d.isSubtask)          return 'task-list-item subtask-list-item';
            return 'task-list-item';
        };

        this.container.selectAll('.task-list-item')
            .data(this.data, d => d.id)
            .join(
                enter => enter.append('div')
                    .attr('class', getClass)
                    .html(buildHtml),
                update => update.html(buildHtml),
                exit => exit.remove()
            )
            .attr('class', getClass) // always reset — clears edit-mode and other classes on exit
            .on('mouseover', function(event, d) {
                if (d.isSubtask || d.isAddSubtaskMarker) return;
                d3.select(this).classed('selected', true);
                self.itemHover(event, d);
            })
            .on('mouseout', function(event, d) {
                if (d.isSubtask || d.isAddSubtaskMarker) return;
                d3.select(this).classed('selected', false);
                self.itemOut(event, d);
            })
            .on('click', function(event, d) {
                if (d.isSubtask || d.isAddSubtaskMarker) return;
                self.itemClick(event, d);
            });

        // Wire chevron toggle
        this.container.selectAll('.task-list-item')
            .filter(d => !d.isSubtask && !d.isAddSubtaskMarker && d.hasSubtasks)
            .select('.task-chevron')
            .on('click', function(event, d) {
                event.stopPropagation();
                self.onToggleExpand(d.id);
            });

        // Wire delete buttons for regular tasks
        this.container.selectAll('.task-list-item')
            .filter(d => !d.isSubtask && !d.isAddSubtaskMarker)
            .select('.task-delete-btn')
            .on('click', function(event, d) {
                event.stopPropagation();
                self.onTaskDelete(d);
            });

        // Wire add-subtask (+) buttons on task rows (milestones cannot have subtasks)
        this.container.selectAll('.task-list-item')
            .filter(d => !d.isSubtask && !d.isAddSubtaskMarker && !d.isMilestone)
            .select('.task-add-subtask-btn')
            .on('click', function(event, d) {
                event.stopPropagation();
                self.onAddSubtask(d.id);
            });

        // Wire delete buttons for subtasks
        this.container.selectAll('.task-list-item.subtask-list-item')
            .select('.subtask-delete-btn')
            .on('click', function(event, d) {
                event.stopPropagation();
                self.onDeleteSubtask(d);
            });

        // Wire click on subtask rows (scroll to subtask start)
        this.container.selectAll('.task-list-item.subtask-list-item')
            .on('click', function(event, d) {
                self.onSubtaskClick(event, d);
            });

        // Wire add-subtask marker click
        this.container.selectAll('.task-list-item.add-subtask-marker-row')
            .on('click', function(event, d) {
                event.stopPropagation();
                self.onAddSubtask(d.addSubtaskFor);
            });

        // Wire progress inputs for regular tasks
        this.container.selectAll('.task-list-item')
            .filter(d => !d.isSubtask && !d.isAddSubtaskMarker)
            .select('.task-progress-input')
            .on('change', function(event, d) {
                event.stopPropagation();
                let val = parseInt(this.value, 10);
                if (isNaN(val)) val = d.progress;
                val = Math.max(0, Math.min(100, val));
                this.value = val;
                const col = val === 100 ? '#10b981'
                    : (val < 100 && d.endDate < today ? '#f59e0b' : 'var(--text-secondary)');
                this.style.color = col;
                this.nextElementSibling.style.color = col;
                if (val !== d.progress) {
                    d.progress = val;
                    self.onTaskProgressChange(d);
                }
            })
            .on('click', function(event) { event.stopPropagation(); });

        // Wire progress inputs for subtasks
        this.container.selectAll('.task-list-item.subtask-list-item')
            .select('.task-progress-input')
            .on('change', function(event, d) {
                event.stopPropagation();
                let val = parseInt(this.value, 10);
                if (isNaN(val)) val = d.progress;
                val = Math.max(0, Math.min(100, val));
                this.value = val;
                const col = val === 100 ? '#10b981'
                    : (val < 100 && d.endDate < today ? '#f59e0b' : 'var(--text-secondary)');
                this.style.color = col;
                this.nextElementSibling.style.color = col;
                if (val !== d.progress) {
                    d.progress = val;
                    self.onSubtaskProgressChange(d);
                }
            })
            .on('click', function(event) { event.stopPropagation(); });

        return this;
    }

    highlightItem(taskId) {
        this.container.selectAll('.task-list-item')
            .filter(d => !d.isSubtask && !d.isAddSubtaskMarker)
            .classed('selected', d => d.id === taskId);
        return this;
    }

    setItemHover(callback = () => {}) { this.itemHover = callback; return this; }
    setItemOut(callback = () => {}) { this.itemOut = callback; return this; }
    setItemClick(callback = () => {}) { this.itemClick = callback; return this; }
    setTaskNameChange(callback = () => {}) { this.onTaskNameChange = callback; return this; }
    setTaskDelete(callback = () => {}) { this.onTaskDelete = callback; return this; }
    setTaskProgressChange(callback = () => {}) { this.onTaskProgressChange = callback; return this; }
    setOnToggleExpand(callback = () => {}) { this.onToggleExpand = callback; return this; }
    setSubtaskProgressChange(callback = () => {}) { this.onSubtaskProgressChange = callback; return this; }
    setOnAddSubtask(callback = () => {}) { this.onAddSubtask = callback; return this; }
    setOnDeleteSubtask(callback = () => {}) { this.onDeleteSubtask = callback; return this; }
    setSubtaskNameChange(callback = () => {}) { this.onSubtaskNameChange = callback; return this; }
    setOnSubtaskClick(callback = () => {}) { this.onSubtaskClick = callback; return this; }
    setExpandedTasks(set) { this.expandedTasks = set; return this; }

    enableEditMode() {
        this.editMode = true;
        const self = this;

        this.container.selectAll('.task-list-item')
            .classed('edit-mode', true)
            .on('mouseover', null)
            .on('mouseout', null)
            .each(function(d) {
                if (d.isAddSubtaskMarker) return;
                const item = d3.select(this);

                if (d.isSubtask) {
                    // Replace subtask name span with an input
                    item.select('.subtask-name').remove();
                    const progressNode = item.select('.task-progress').node();
                    const input = document.createElement('input');
                    input.type = 'text';
                    input.className = 'task-name-input';
                    input.value = d.name;
                    this.insertBefore(input, progressNode);
                    d3.select(input).on('blur', function() {
                        const newName = this.value.trim();
                        if (newName && newName !== d.name) {
                            d.name = newName;
                            self.onSubtaskNameChange(d);
                        } else if (!newName) {
                            this.value = d.name;
                        }
                    });
                } else {
                    // Replace task name span with an input
                    item.select('.task-name').remove();
                    const datesNode = item.select('.task-dates').node();
                    const input = document.createElement('input');
                    input.type = 'text';
                    input.className = 'task-name-input';
                    input.value = d.name;
                    this.insertBefore(input, datesNode);
                    d3.select(input).on('blur', function() {
                        const newName = this.value.trim();
                        if (newName && newName !== d.name) {
                            d.name = newName;
                            self.onTaskNameChange(d);
                        } else if (!newName) {
                            this.value = d.name;
                        }
                    });
                }
            });

        return this;
    }

    disableEditMode() {
        this.editMode = false;
        this.render(this.data);
        return this;
    }
}
