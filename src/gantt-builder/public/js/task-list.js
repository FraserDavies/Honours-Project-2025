// TaskList Class
// Renders the task names on the left panel
class TaskList {
    container;
    data;
    itemHover = () => {};
    itemOut = () => {};
    itemClick = () => {};
    editMode = false;
    onTaskNameChange = () => {};

    constructor(container) {
        this.container = d3.select(container);
        this.data = [];
    }

    render(taskData) {
        this.data = taskData || [];
        const self = this;

        this.container.selectAll('.task-list-item')
            .data(this.data, d => d.id)
            .join(
                enter => enter.append('div')
                    .attr('class', 'task-list-item')
                    .html(d => {
                        // Use diamond shape for milestones, circle for regular tasks
                        const indicator = d.isMilestone
                            ? `<div class="task-color-diamond" style="background: ${d.colour || '#f59e0b'}"></div>`
                            : `<div class="task-color-dot" style="background: ${d.colour || '#3b82f6'}"></div>`;
                        return `
                            ${indicator}
                            <span class="task-name">${d.name}</span>
                            <span class="task-dates">${d3.timeFormat('%d %b')(d.startDate)}</span>
                        `;
                    }),
                update => update
                    .html(d => {
                        const indicator = d.isMilestone
                            ? `<div class="task-color-diamond" style="background: ${d.colour || '#f59e0b'}"></div>`
                            : `<div class="task-color-dot" style="background: ${d.colour || '#3b82f6'}"></div>`;
                        return `
                            ${indicator}
                            <span class="task-name">${d.name}</span>
                            <span class="task-dates">${d3.timeFormat('%d %b')(d.startDate)}</span>
                        `;
                    }),
                exit => exit.remove()
            )
            .on('mouseover', function(event, d) {
                d3.select(this).classed('selected', true);
                self.itemHover(event, d);
            })
            .on('mouseout', function(event, d) {
                d3.select(this).classed('selected', false);
                self.itemOut(event, d);
            })
            .on('click', function(event, d) {
                self.itemClick(event, d);
            });

        return this;
    }

    highlightItem(taskId) {
        this.container.selectAll('.task-list-item')
            .classed('selected', d => d.id === taskId);
        return this;
    }

    setItemHover(callback = () => {}) {
        this.itemHover = callback;
        return this;
    }

    setItemOut(callback = () => {}) {
        this.itemOut = callback;
        return this;
    }

    setItemClick(callback = () => {}) {
        this.itemClick = callback;
        return this;
    }

    setTaskNameChange(callback = () => {}) {
        this.onTaskNameChange = callback;
        return this;
    }

    enableEditMode() {
        this.editMode = true;
        const self = this;

        this.container.selectAll('.task-list-item')
            .classed('edit-mode', true)
            .on('mouseover', null)
            .on('mouseout', null)
            .each(function(d) {
                const item = d3.select(this);
                // Replace the name span with an input
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
            });

        return this;
    }

    disableEditMode() {
        this.editMode = false;
        this.render(this.data);
        return this;
    }
}
