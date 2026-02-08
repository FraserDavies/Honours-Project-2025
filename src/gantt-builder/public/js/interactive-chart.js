class GanttChart {
    // Configuration of things
    width;
    height;
    margin;
    rowHeight;
    barHeight;
    dayWidth; // Pixels per day for horizontal scrolling
    pixelShaving = 4; // Amount of pixels shaved off from each side

    // D3 Selections
    svg;
    chartArea;
    axisX;
    axisXMonths;
    gridLines;
    rowBackgrounds;
    dependencyLines;
    taskBars;
    taskLabels;
    todayLine;

    // Scales
    scaleX;
    scaleY;

    // Data
    data;
    dependencies;
    dateExtent;

    // Callbacks
    taskHover = () => {};
    taskOut = () => {};
    taskClick = () => {};

    constructor(container, options = {}) {
        this.rowHeight = options.rowHeight || 48;  // Height per task row
        this.barHeight = options.barHeight || 24;  // Height of task bars
        this.dayWidth = options.dayWidth || 40;    // Pixels per day!!! (controls zoom lowk)
        this.margin = options.margin || { top: 50, bottom: 20, left: 0, right: 20 };

        this.container = d3.select(container);
        this.data = [];
        this.dependencies = [];

        // =============== SVG ===============
        // Creating the SVG 
        this.svg = this.container.append('svg').attr('class', 'chart-svg');

        // Create the main chart group with a lil margin translation
        this.chartArea = this.svg.append('g').attr('class', 'chart-area') // REMINDER g is group
            .attr('transform', `translate(${this.margin.left}, ${this.margin.top})`);

        // =============== LAYERS ===============
        // Create layer groups in correct z-order (what appears on top and bottom)
        this.rowBackgrounds = this.chartArea.append('g').attr('class', 'rows-layer');
        this.gridLines = this.chartArea.append('g').attr('class', 'grid-layer');
        this.dependencyLines = this.chartArea.append('g').attr('class', 'dependencies-layer');
        this.taskBars = this.chartArea.append('g').attr('class', 'bars-layer');
        this.taskLabels = this.chartArea.append('g').attr('class', 'labels-layer');
        this.todayLine = this.chartArea.append('g').attr('class', 'today-layer');

        // ================= DATES =================
        // Create X axis groups (days and months)
        this.axisX = this.svg.append('g')
            .attr('class', 'axis-x axis-days')
            .attr('transform', `translate(${this.margin.left}, ${this.margin.top - 5})`); // 5 px from top

        this.axisXMonths = this.svg.append('g')
            .attr('class', 'axis-x axis-months')
            .attr('transform', `translate(${this.margin.left}, 15)`); // 15 px from top
    }

    // Getters for chart dimensions
    get chartWidth() {
        return this.width - this.margin.left - this.margin.right;
    }
    get chartHeight() {
        return this.data.length * this.rowHeight;
    }

    // Calculate the date range from task data
    #calculateDateExtent() {
        if (!this.data || this.data.length === 0) {
            const today = new Date();
            return [
                d3.timeDay.offset(today, -7),
                d3.timeDay.offset(today, 30)
            ];
        }

        const allDates = [
            ...this.data.map(d => d.startDate),
            ...this.data.map(d => d.endDate)
        ];

        const minDate = d3.min(allDates);
        const maxDate = d3.max(allDates);

        // Add padding (1 week before and after)
        return [
            d3.timeDay.offset(minDate, -7),
            d3.timeDay.offset(maxDate, 7)
        ];
    }

    
    // Updating the scales based on data
    #updateScales() {
        this.dateExtent = this.#calculateDateExtent(); // Get start and end dates

        // Calculate number of days in the range
        const dayCount = d3.timeDay.count(this.dateExtent[0], this.dateExtent[1]);

        // Set width based on day count and dayWidth
        this.width = Math.max(800, dayCount * this.dayWidth + this.margin.left + this.margin.right);
        this.height = this.chartHeight + this.margin.top + this.margin.bottom;

        // Update SVG dimensions
        this.svg
            .attr('width', this.width)
            .attr('height', this.height);

        // X Scale: Time scale for dates
        this.scaleX = d3.scaleTime()
            .domain(this.dateExtent)
            .range([0, this.chartWidth]);

        // Y Scale: Band scale for task rows
        this.scaleY = d3.scaleBand()
            .domain(this.data.map(d => d.id))
            .range([0, this.chartHeight])
            .padding(0.2);
    }

    
    // Update the X axis with days
    #updateAxisDays() {
        // Calculate font size based on zoom level (dayWidth)
        const defaultDayWidth = 35;
        const defaultFontSize = 10;
        const minFontSize = 6;
        const maxFontSize = 14;

        const zoomRatio = this.dayWidth / defaultDayWidth;
        const fontSize = Math.max(minFontSize, Math.min(maxFontSize, defaultFontSize * zoomRatio));

        // Hide day labels if zoomed out too far (font would be too small to read)
        const showDayLabels = this.dayWidth >= 8;

        const axisGen = d3.axisTop(this.scaleX)
            .ticks(d3.timeDay.every(1))
            .tickSize(0)
            .tickFormat(d => showDayLabels ? d.getDate() : '');

        this.axisX.call(axisGen)
            .selectAll('.tick text')
            .attr('dy', -8)
            .style('font-size', `${fontSize}px`)
            .style('fill', d => {
                const day = d.getDay();
                return (day === 0 || day === 6) ? '#94a3b8' : '#64748b';
            });

        // Hide the axis domain line
        this.axisX.select('.domain').attr('stroke', 'none');
    }

    // Update the month labels axis
    #updateAxisMonths() {
        const months = d3.timeMonths(this.dateExtent[0], this.dateExtent[1]);

        // Add the first day of range if it's not already a month start
        if (months.length === 0 || months[0] > this.dateExtent[0]) {
            months.unshift(this.dateExtent[0]);
        }

        // Calculate font size based on zoom level
        const defaultDayWidth = 35;
        const defaultFontSize = 11;
        const minFontSize = 10;
        const maxFontSize = 15;

        const zoomRatio = this.dayWidth / defaultDayWidth;
        const fontSize = Math.max(minFontSize, Math.min(maxFontSize, defaultFontSize * zoomRatio));

        this.axisXMonths.selectAll('.month-label')
            .data(months, d => d.getTime())
            .join(
                enter => enter.append('text')
                    .attr('class', 'month-label')
                    .attr('x', d => this.scaleX(d))
                    .attr('y', 0)
                    .attr('dy', '0.35em')
                    .style('font-size', `${fontSize}px`)
                    .style('font-weight', '600')
                    .style('fill', '#1e293b')
                    .text(d => d3.timeFormat('%B %Y')(d)),
                update => update
                    .attr('x', d => this.scaleX(d))
                    .style('font-size', `${fontSize}px`)
                    .text(d => d3.timeFormat('%B %Y')(d)),
                exit => exit.remove()
            );
    }

    // Update vertical grid lines for each day
    #updateGridLines() {
        const days = d3.timeDays(this.dateExtent[0], this.dateExtent[1]);

        this.gridLines.selectAll('.grid-line')
            .data(days, d => d.getTime())
            .join(
                enter => enter.append('line')
                    .attr('class', d => {
                        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                        return `grid-line ${isWeekend ? 'weekend' : ''}`;
                    })
                    .attr('x1', d => this.scaleX(d))
                    .attr('y1', 0)
                    .attr('x2', d => this.scaleX(d))
                    .attr('y2', this.chartHeight),
                update => update
                    .attr('x1', d => this.scaleX(d))
                    .attr('x2', d => this.scaleX(d))
                    .attr('y2', this.chartHeight),
                exit => exit.remove()
            );
    }

    // Update row backgrounds for alternating colours and hover effects
    #updateRowBackgrounds() {
        this.rowBackgrounds.selectAll('.row-bg')
            .data(this.data, d => d.id)
            .join(
                enter => enter.append('rect')
                    .attr('class', (d, i) => `row-bg ${i % 2 === 0 ? 'even' : 'odd'}`)
                    .attr('x', 0)
                    .attr('y', d => this.scaleY(d.id) - this.scaleY.bandwidth() * 0.1)
                    .attr('width', this.chartWidth)
                    .attr('height', this.rowHeight),
                update => update
                    .attr('y', d => this.scaleY(d.id) - this.scaleY.bandwidth() * 0.1)
                    .attr('width', this.chartWidth),
                exit => exit.remove()
            );
    }

    // Helper to generate diamond points for milestones
    #getDiamondPoints(cx, cy, size) {
        return `${cx},${cy - size} ${cx + size},${cy} ${cx},${cy + size} ${cx - size},${cy}`;
    }

    // Helper to get status border color for tasks
    // Returns: { stroke: color, strokeWidth: number } or null if no status border needed
    #getTaskStatusStyle(task) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Completed: 100% progress
        if (task.progress === 100) {
            return { stroke: '#10b981', strokeWidth: 3 }; // Green - Completed
        }

        // At Risk: Not complete and past end date
        if (task.progress < 100 && task.endDate < today) {
            return { stroke: '#f59e0b', strokeWidth: 3 }; // Orange - At Risk
        }

        // No special status
        return null;
    }

    // Draw task bars with animations
    #updateBars() {
        // Separate regular tasks and milestones
        const regularTasks = this.data.filter(d => !d.isMilestone);
        const milestones = this.data.filter(d => d.isMilestone);

        // =============== REGULAR TASK BARS ===============
        const bars = this.taskBars.selectAll('.task-bar-group')
            .data(regularTasks, d => d.id)
            .join(
                enter => {
                    const g = enter.append('g')
                        .attr('class', 'task-bar-group');

                    // Background bar (full task duration)
                    g.append('rect')
                        .attr('class', 'task-bar')
                        .attr('x', d => this.scaleX(d.startDate) + this.pixelShaving)
                        .attr('y', d => this.scaleY(d.id) + (this.scaleY.bandwidth() - this.barHeight) / 2)
                        .attr('width', 0)
                        .attr('height', this.barHeight)
                        .attr('rx', 4)
                        .attr('ry', 4)
                        .attr('fill', d => d.colour || '#3b82f6')
                        .attr('stroke', d => {
                            const status = this.#getTaskStatusStyle(d);
                            return status ? status.stroke : 'none';
                        })
                        .attr('stroke-width', d => {
                            const status = this.#getTaskStatusStyle(d);
                            return status ? status.strokeWidth : 0;
                        });

                    // Progress bar overlay
                    g.append('rect')
                        .attr('class', 'task-bar-progress')
                        .attr('x', d => this.scaleX(d.startDate) + this.pixelShaving)
                        .attr('y', d => this.scaleY(d.id) + (this.scaleY.bandwidth() - this.barHeight) / 2)
                        .attr('width', 0)
                        .attr('height', this.barHeight)
                        .attr('rx', 4)
                        .attr('ry', 4)
                        .attr('fill', 'rgba(255,255,255,0.3)');

                    return g;
                },
                update => update,
                exit => exit.transition().duration(300)
                    .style('opacity', 0)
                    .remove()
            );

        // Animate bar positions and sizes
        bars.select('.task-bar')
            .transition().duration(500)
            .attr('x', d => this.scaleX(d.startDate) + this.pixelShaving)
            .attr('y', d => this.scaleY(d.id) + (this.scaleY.bandwidth() - this.barHeight) / 2)
            .attr('width', d => Math.max(0, this.scaleX(d.endDate) - this.scaleX(d.startDate) - (this.pixelShaving * 2)))
            .attr('fill', d => d.colour || '#3b82f6')
            .attr('stroke', d => {
                const status = this.#getTaskStatusStyle(d);
                return status ? status.stroke : 'none';
            })
            .attr('stroke-width', d => {
                const status = this.#getTaskStatusStyle(d);
                return status ? status.strokeWidth : 0;
            });

        // Animate progress overlay
        bars.select('.task-bar-progress')
            .transition().duration(500)
            .attr('x', d => this.scaleX(d.startDate) + this.pixelShaving)
            .attr('y', d => this.scaleY(d.id) + (this.scaleY.bandwidth() - this.barHeight) / 2)
            .attr('width', d => {
                const fullWidth = this.scaleX(d.endDate) - this.scaleX(d.startDate) - (this.pixelShaving * 2);
                const progress = d.progress || 0;
                return Math.max(0, fullWidth * (progress / 100));
            });

        // =============== MILESTONE DIAMONDS ===============
        const milestoneSize = this.barHeight / 2; // Diamond size

        const milestoneGroups = this.taskBars.selectAll('.milestone-group')
            .data(milestones, d => d.id)
            .join(
                enter => {
                    const g = enter.append('g')
                        .attr('class', 'milestone-group');

                    // Diamond shape
                    g.append('polygon')
                        .attr('class', 'milestone-diamond')
                        .attr('points', d => {
                            const cx = this.scaleX(d.startDate);
                            const cy = this.scaleY(d.id) + this.scaleY.bandwidth() / 2;
                            return this.#getDiamondPoints(cx, cy, milestoneSize);
                        })
                        .attr('fill', d => d.colour || '#f59e0b')
                        .attr('stroke', d => {
                            // Darken the fill colour for stroke
                            const color = d3.color(d.colour || '#f59e0b');
                            return color ? color.darker(0.5) : '#d97706';
                        })
                        .attr('stroke-width', 2)
                        .style('opacity', 0);

                    return g;
                },
                update => update,
                exit => exit.transition().duration(300)
                    .style('opacity', 0)
                    .remove()
            );

        // Animate milestone diamonds
        milestoneGroups.select('.milestone-diamond')
            .transition().duration(500)
            .attr('points', d => {
                const cx = this.scaleX(d.startDate);
                const cy = this.scaleY(d.id) + this.scaleY.bandwidth() / 2;
                return this.#getDiamondPoints(cx, cy, milestoneSize);
            })
            .attr('fill', d => d.colour || '#f59e0b')
            .attr('stroke', d => {
                const color = d3.color(d.colour || '#f59e0b');
                return color ? color.darker(0.5) : '#d97706';
            })
            .style('opacity', 1);

        // Attach event listeners
        this.#updateBarEvents();
    }

    // Attach event handlers to bars and milestones
    #updateBarEvents() {
        const self = this;

        // Event handlers for regular task bars
        this.taskBars.selectAll('.task-bar')
            .on('mouseover', function(event, d) {
                d3.select(this).classed('highlighted', true);
                self.taskHover(event, d);
            })
            .on('mouseout', function(event, d) {
                d3.select(this).classed('highlighted', false);
                self.taskOut(event, d);
            })
            .on('click', function(event, d) {
                self.taskClick(event, d);
            });

        // Event handlers for milestone diamonds
        this.taskBars.selectAll('.milestone-diamond')
            .on('mouseover', function(event, d) {
                d3.select(this).classed('highlighted', true);
                self.taskHover(event, d);
            })
            .on('mouseout', function(event, d) {
                d3.select(this).classed('highlighted', false);
                self.taskOut(event, d);
            })
            .on('click', function(event, d) {
                self.taskClick(event, d);
            });
    }

    // Draw task labels inside bars and next to milestones
    #updateLabels() {
        // Separate regular tasks and milestones
        const regularTasks = this.data.filter(d => !d.isMilestone);
        const milestones = this.data.filter(d => d.isMilestone);
        const milestoneSize = this.barHeight / 2;

        // Labels for regular task bars (inside the bar)
        this.taskLabels.selectAll('.task-label')
            .data(regularTasks, d => d.id)
            .join(
                enter => enter.append('text')
                    .attr('class', 'task-label')
                    .attr('x', d => this.scaleX(d.startDate) + 8)
                    .attr('y', d => this.scaleY(d.id) + this.scaleY.bandwidth() / 2)
                    .attr('dy', '0.35em')
                    .text(d => {
                        const barWidth = this.scaleX(d.endDate) - this.scaleX(d.startDate);
                        return barWidth > 80 ? d.name : '';
                    })
                    .style('opacity', 0),
                update => update,
                exit => exit.remove()
            )
            .transition().duration(500)
            .attr('x', d => this.scaleX(d.startDate) + 8)
            .attr('y', d => this.scaleY(d.id) + this.scaleY.bandwidth() / 2)
            .text(d => {
                const barWidth = this.scaleX(d.endDate) - this.scaleX(d.startDate);
                return barWidth > 80 ? d.name : '';
            })
            .style('opacity', 1);

    }

    // Draw today indicator line
    #updateTodayLine() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Check if today is within the chart domain
        if (today < this.dateExtent[0] || today > this.dateExtent[1]) {
            this.todayLine.selectAll('*').remove();
            return;
        }

        const x = this.scaleX(today);

        // Draw the line
        this.todayLine.selectAll('.today-line')
            .data([today])
            .join('line')
            .attr('class', 'today-line')
            .attr('x1', x)
            .attr('y1', 0)
            .attr('x2', x)
            .attr('y2', this.chartHeight);

        // Draw the label
        this.todayLine.selectAll('.today-marker')
            .data([today])
            .join('text')
            .attr('class', 'today-marker')
            .attr('x', x)
            .attr('y', -10)
            .attr('text-anchor', 'middle')
            .text('Today');
    }

    // Draw dependency lines between tasks
    #updateDependencyLines() {
        if (!this.dependencies || this.dependencies.length === 0) {
            this.dependencyLines.selectAll('*').remove();
            return;
        }

        // Create a map of task id to task data for quick lookup
        const taskMap = new Map(this.data.map(t => [t.id, t]));

        // Build dependency path data
        const depData = this.dependencies
            .map(dep => {
                const predecessor = taskMap.get(dep.predecessorTaskId);
                const successor = taskMap.get(dep.successorTaskId);

                if (!predecessor || !successor) return null;

                const predecessorY = this.scaleY(predecessor.id) + this.scaleY.bandwidth() / 2;
                const successorY = this.scaleY(successor.id) + this.scaleY.bandwidth() / 2;

                // Main dependency line points (original positions with gap)
                let startX, endX;
                // Connector points that touch the bar edges
                let barStartX, barEndX;

                if (dep.dependencyType === 'start-to-start') {
                    startX = this.scaleX(predecessor.startDate);
                    endX = this.scaleX(successor.startDate);
                    barStartX = this.scaleX(predecessor.startDate) + this.pixelShaving;
                    barEndX = this.scaleX(successor.startDate) + this.pixelShaving;
                } else {
                    startX = this.scaleX(predecessor.endDate);
                    endX = this.scaleX(successor.startDate);
                    barStartX = this.scaleX(predecessor.endDate) - this.pixelShaving;
                    barEndX = this.scaleX(successor.startDate) + this.pixelShaving;
                }

                return {
                    id: dep.id,
                    barStartX,   // where the predecessor bar edge is
                    startX,      // where the main line starts
                    startY: predecessorY,
                    endX,        // where the main line ends
                    endY: successorY,
                    barEndX,     // where the successor bar edge is
                    type: dep.dependencyType
                };
            })
            .filter(d => d !== null);

        // D3 line generator with stepAfter curve
        const lineGenerator = d3.line()
            .curve(d3.curveStepAfter)
            .x(d => d.x)
            .y(d => d.y);

        // Remove old elements before redrawing
        this.dependencyLines.selectAll('.dependency-group').remove();

        // Draw dependency groups (each has 3 lines: connector → main → connector)
        const groups = this.dependencyLines.selectAll('.dependency-group')
            .data(depData, d => d.id)
            .join(
                enter => {
                    const g = enter.append('g')
                        .attr('class', 'dependency-group');

                    // Line 1: Connector from predecessor bar edge to main line start
                    g.append('line')
                        .attr('class', 'dependency-line dependency-connector')
                        .attr('x1', d => d.barStartX)
                        .attr('y1', d => d.startY)
                        .attr('x2', d => d.startX)
                        .attr('y2', d => d.startY);

                    // Line 2: Main stepped dependency line
                    g.append('path')
                        .attr('class', 'dependency-line dependency-main')
                        .attr('d', d => {
                            const points = [
                                { x: d.startX, y: d.startY },
                                { x: d.endX, y: d.endY }
                            ];
                            return lineGenerator(points);
                        })
                        .attr('fill', 'none');

                    // Line 3: Connector from main line end to successor bar edge
                    g.append('line')
                        .attr('class', 'dependency-line dependency-connector')
                        .attr('x1', d => d.endX)
                        .attr('y1', d => d.endY)
                        .attr('x2', d => d.barEndX)
                        .attr('y2', d => d.endY);

                    g.style('opacity', 0);
                    return g;
                },
                update => update,
                exit => exit.transition().duration(300)
                    .style('opacity', 0)
                    .remove()
            );

        // Animate in
        groups.transition().duration(500)
            .style('opacity', 1);

    }

    // Set dependencies data
    setDependencies(dependencies) {
        this.dependencies = dependencies || [];
        if (this.data.length > 0) {
            this.#updateDependencyLines();
        }
        return this;
    }

    // Array of task objects
    render(taskData) {
        this.data = taskData || [];

        if (this.data.length === 0) {
            this.svg.attr('width', 0).attr('height', 0);
            return this;
        }

        // Update all components
        this.#updateScales();
        this.#updateAxisDays();
        this.#updateAxisMonths();
        this.#updateGridLines();
        this.#updateRowBackgrounds();
        this.#updateBars();
        this.#updateLabels();
        this.#updateDependencyLines();
        this.#updateTodayLine();

        return this;
    }

    // Array of task IDs to highlight (works for both bars and milestones)
    highlightTasks(taskIds = []) {
        // Highlight regular task bars
        this.taskBars.selectAll('.task-bar')
            .classed('highlighted', false)
            .filter(d => taskIds.includes(d.id))
            .classed('highlighted', true);

        // Highlight milestone diamonds
        this.taskBars.selectAll('.milestone-diamond')
            .classed('highlighted', false)
            .filter(d => taskIds.includes(d.id))
            .classed('highlighted', true);

        return this;
    }

    // Scroll to today's date
    scrollToToday() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (today >= this.dateExtent[0] && today <= this.dateExtent[1]) {
            const x = this.scaleX(today);
            const containerWidth = this.container.node().clientWidth;
            const scrollX = Math.max(0, x - containerWidth / 2);

            this.container.node().parentElement.scrollLeft = scrollX;
        }
        return this;
    }

    // Set hover callback
    setTaskHover(callback = () => {}) {
        this.taskHover = callback;
        this.#updateBarEvents();
        return this;
    }

    // Set mouseout callback
    setTaskOut(callback = () => {}) {
        this.taskOut = callback;
        this.#updateBarEvents();
        return this;
    }

    // Set click callback
    setTaskClick(callback = () => {}) {
        this.taskClick = callback;
        this.#updateBarEvents();
        return this;
    }

    // =============== ZOOM METHODS ===============

    // Get current zoom level as percentage (based on default dayWidth of 35)
    getZoomLevel() {
        const defaultDayWidth = 35;
        return Math.round((this.dayWidth / defaultDayWidth) * 100);
    }

    // Set zoom level (percentage, e.g., 100 = 100%)
    setZoom(percentage) {
        const defaultDayWidth = 35;
        const minZoom = 25;  // 25% minimum
        const maxZoom = 200; // 200% maximum

        // Clamp the percentage
        const clampedPercentage = Math.max(minZoom, Math.min(maxZoom, percentage));

        this.dayWidth = (clampedPercentage / 100) * defaultDayWidth;

        // Re-render the chart
        if (this.data.length > 0) {
            this.render(this.data);
        }

        return this.getZoomLevel();
    }

    // Zoom in by a step (default 25%)
    zoomIn(step = 25) {
        const currentZoom = this.getZoomLevel();
        return this.setZoom(currentZoom + step);
    }

    // Zoom out by a step (default 25%)
    zoomOut(step = 25) {
        const currentZoom = this.getZoomLevel();
        return this.setZoom(currentZoom - step);
    }

    // Reset zoom to 100%
    resetZoom() {
        return this.setZoom(100);
    }
}

// TaskList Class
// Renders the task names on the left panel
class TaskList {
    container;
    data;
    itemHover = () => {};
    itemOut = () => {};
    itemClick = () => {};

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
}


// TooltipManager Class 
// Manages the tooltip display
class TooltipManager {
    element;

    constructor(selector) {
        this.element = d3.select(selector);
    }

    show(event, data) {
        const title = this.element.select('.tooltip-title');
        const dates = this.element.select('.tooltip-dates');
        const progress = this.element.select('.tooltip-progress');

        title.text(data.name);

        // Show different info for milestones vs regular tasks
        if (data.isMilestone) {
            dates.text(`Milestone: ${d3.timeFormat('%d %b %Y')(data.startDate)}`);
            progress.text('');
        } else {
            dates.text(`${d3.timeFormat('%d %b %Y')(data.startDate)} - ${d3.timeFormat('%d %b %Y')(data.endDate)}`);
            progress.text(`Progress: ${data.progress || 0}%`);
        }

        // Position tooltip
        const x = event.clientX + 15;
        const y = event.clientY + 15;

        this.element
            .style('left', `${x}px`)
            .style('top', `${y}px`)
            .classed('visible', true);
    }

    hide() {
        this.element.classed('visible', false);
    }
}

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

    ganttChart
        .setTaskHover(handleTaskHover)
        .setTaskOut(handleTaskOut)
        .setTaskClick(handleTaskClick);

    taskList
        .setItemHover(handleListHover)
        .setItemOut(handleListOut);

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

    console.log(`Interactive Gantt Chart initialised for project ${projectId}`);
});
