// ============================================
//   GanttChart Class
//   Renders the SVG chart area: bars, axes,
//   grid, dependency lines, and edit-mode drag
// ============================================

class GanttChart {
    // Configuration of things
    width;
    height;
    margin;
    rowHeight;
    barHeight;
    dayWidth; // Pixels per day for horizontal scrolling
    pixelShaving = 4; // Amount of pixels shaved off from each side
    dependencyBall = 8;

    // D3 Selections
    svg;
    chartArea;
    axisBackground;
    axisBackgroundRect;
    axisBackgroundBorder;
    axisX;
    axisXMonths;
    gridLines;
    rowBackgrounds;
    dependencyLines;
    dropPreview;
    taskBars;
    taskLabels;
    todayLine;
    projectBoundsLayer;
    depHandles;
    depDragLayer;

    // Scales
    scaleX;
    scaleY;

    // Data
    data;
    dependencies;
    dateExtent;

    // Project boundary dates (null = not set)
    projectStart = null;
    projectEnd   = null;

    // Callbacks
    taskHover = () => {};
    taskOut = () => {};
    taskClick = () => {};
    onTaskDateChange = () => {};
    onTaskDateChangeLive = () => {};
    onDependencyCreate = () => {};
    onDependencyDelete = () => {};
    onSubtaskBarClick = () => {};

    // Edit mode state
    editMode = false;

    // Auto-scroll state (used during drag near chart edges)
    #autoScrollRAF = null;
    #autoScrollSpeed = 0;
    #autoScrollApplyFn = null;  // called each rAF frame to reposition the dragged element
    #autoScrollExtraPx = 0;     // px scrolled by rAF since drag start

    // Dependency handle drag state
    #depDragActive    = false;
    #depDragStartId   = null;
    #depDragStartSide = null;
    #depDragLine      = null;
    #depBoundMouseMove = null;
    #depBoundMouseUp   = null;

    constructor(container, options = {}) {
        this.rowHeight = options.rowHeight || 48;         // Height per task row
        this.barHeight = options.barHeight || 24;         // Height of task bars
        this.subtaskBarHeight = options.subtaskBarHeight || 14; // Height of subtask bars
        this.dayWidth = options.dayWidth || 40;           // Pixels per day!!! (controls zoom lowk)
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
        this.dropPreview = this.chartArea.append('g').attr('class', 'drop-preview-layer');
        this.taskBars = this.chartArea.append('g').attr('class', 'bars-layer');
        this.taskLabels = this.chartArea.append('g').attr('class', 'labels-layer');
        this.todayLine          = this.chartArea.append('g').attr('class', 'today-layer');
        this.projectBoundsLayer = this.chartArea.append('g').attr('class', 'project-bounds-layer');
        // Dependency handle circles (visible in edit mode, above all other layers)
        this.depHandles   = this.chartArea.append('g').attr('class', 'dep-handles-layer');
        this.depDragLayer = this.chartArea.append('g').attr('class', 'dep-drag-layer');

        // ================= DATES =================
        // Background rect that sits behind the axis labels (covers rows when sticky)
        this.axisBackground = this.svg.append('g').attr('class', 'axis-background');
        this.axisBackgroundRect = this.axisBackground.append('rect')
            .attr('x', 0)
            .attr('y', 0)
            .attr('fill', 'var(--bg-white, #ffffff)');
        this.axisBackgroundBorder = this.axisBackground.append('line')
            .attr('x1', 0)
            .attr('stroke', 'var(--border-color, #dee2e6)')
            .attr('stroke-width', 1);

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
        // Size the sticky axis background to cover the full SVG width and header height
        this.axisBackgroundRect
            .attr('width', this.width)
            .attr('height', this.margin.top);
        this.axisBackgroundBorder
            .attr('x2', this.width)
            .attr('y1', this.margin.top)
            .attr('y2', this.margin.top);

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
                    .attr('class', (d, i) => {
                        if (d.isSubtask) return 'row-bg subtask-row';
                        if (d.isAddSubtaskMarker) return 'row-bg add-subtask-row-bg';
                        return `row-bg ${i % 2 === 0 ? 'even' : 'odd'}`;
                    })
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
        // Separate regular tasks, milestones, and subtasks (markers have no bar)
        const regularTasks = this.data.filter(d => !d.isMilestone && !d.isSubtask && !d.isAddSubtaskMarker);
        const milestones   = this.data.filter(d => d.isMilestone);
        const subtasks     = this.data.filter(d => d.isSubtask);

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

                    // Left resize handle (covers leftmost 8px of bar)
                    g.append('rect')
                        .attr('class', 'task-resize-handle task-resize-left')
                        .attr('x', d => this.scaleX(d.startDate) + this.pixelShaving)
                        .attr('y', d => this.scaleY(d.id) + (this.scaleY.bandwidth() - this.barHeight) / 2)
                        .attr('width', 8)
                        .attr('height', this.barHeight)
                        .attr('fill', 'transparent')
                        .attr('rx', 4);

                    // Right resize handle (covers rightmost 8px of bar)
                    g.append('rect')
                        .attr('class', 'task-resize-handle task-resize-right')
                        .attr('x', d => this.scaleX(d.startDate) + this.pixelShaving)
                        .attr('y', d => this.scaleY(d.id) + (this.scaleY.bandwidth() - this.barHeight) / 2)
                        .attr('width', 8)
                        .attr('height', this.barHeight)
                        .attr('fill', 'transparent')
                        .attr('rx', 4);

                    // Left edge grip indicator (shown via CSS when handle is hovered)
                    g.append('rect')
                        .attr('class', 'task-resize-indicator task-resize-indicator-left')
                        .attr('width', 3)
                        .attr('height', this.barHeight - 8)
                        .attr('rx', 1)
                        .attr('ry', 1)
                        .attr('fill', 'rgba(255,255,255,0.9)')
                        .attr('pointer-events', 'none');

                    // Right edge grip indicator (shown via CSS when handle is hovered)
                    g.append('rect')
                        .attr('class', 'task-resize-indicator task-resize-indicator-right')
                        .attr('width', 3)
                        .attr('height', this.barHeight - 8)
                        .attr('rx', 1)
                        .attr('ry', 1)
                        .attr('fill', 'rgba(255,255,255,0.9)')
                        .attr('pointer-events', 'none');

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

        // Update resize handle positions
        bars.select('.task-resize-left')
            .transition().duration(500)
            .attr('x', d => this.scaleX(d.startDate) + this.pixelShaving)
            .attr('y', d => this.scaleY(d.id) + (this.scaleY.bandwidth() - this.barHeight) / 2);

        bars.select('.task-resize-right')
            .transition().duration(500)
            .attr('x', d => this.scaleX(d.endDate) - this.pixelShaving - 8)
            .attr('y', d => this.scaleY(d.id) + (this.scaleY.bandwidth() - this.barHeight) / 2);

        // Grip indicator positions (centred vertically in the bar)
        bars.select('.task-resize-indicator-left')
            .transition().duration(500)
            .attr('x', d => this.scaleX(d.startDate) + this.pixelShaving + 3)
            .attr('y', d => this.scaleY(d.id) + (this.scaleY.bandwidth() - this.barHeight) / 2 + 4)
            .attr('height', this.barHeight - 8);

        bars.select('.task-resize-indicator-right')
            .transition().duration(500)
            .attr('x', d => this.scaleX(d.endDate) - this.pixelShaving - 6)
            .attr('y', d => this.scaleY(d.id) + (this.scaleY.bandwidth() - this.barHeight) / 2 + 4)
            .attr('height', this.barHeight - 8);

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

        // =============== SUBTASK BARS ===============
        const self = this;
        const subtaskBars = this.taskBars.selectAll('.subtask-bar-group')
            .data(subtasks, d => d.id)
            .join(
                enter => {
                    const g = enter.append('g').attr('class', 'subtask-bar-group');
                    g.append('rect').attr('class', 'subtask-bar').attr('rx', 3).attr('ry', 3);
                    g.append('rect').attr('class', 'subtask-bar-progress').attr('rx', 3).attr('ry', 3)
                        .attr('fill', 'rgba(255,255,255,0.35)').attr('pointer-events', 'none');
                    return g;
                },
                update => update,
                exit => exit.transition().duration(300).style('opacity', 0).remove()
            );

        subtaskBars.select('.subtask-bar')
            .transition().duration(500)
            .attr('x', d => this.scaleX(d.startDate) + this.pixelShaving)
            .attr('y', d => this.scaleY(d.id) + (this.scaleY.bandwidth() - this.subtaskBarHeight) / 2)
            .attr('width', d => Math.max(0, this.scaleX(d.endDate) - this.scaleX(d.startDate) - this.pixelShaving * 2))
            .attr('height', this.subtaskBarHeight)
            .attr('fill', d => d.colour || '#3b82f6')
            .attr('fill-opacity', 0.65);

        subtaskBars.select('.subtask-bar-progress')
            .transition().duration(500)
            .attr('x', d => this.scaleX(d.startDate) + this.pixelShaving)
            .attr('y', d => this.scaleY(d.id) + (this.scaleY.bandwidth() - this.subtaskBarHeight) / 2)
            .attr('height', this.subtaskBarHeight)
            .attr('width', d => {
                const fullWidth = this.scaleX(d.endDate) - this.scaleX(d.startDate) - this.pixelShaving * 2;
                return Math.max(0, fullWidth * ((d.progress || 0) / 100));
            });

        // Click subtask bar → fire callback for progress popover
        subtaskBars.select('.subtask-bar')
            .on('click', function(event, d) {
                self.onSubtaskBarClick(d.subtaskId, event.clientX, event.clientY);
            });
    }

    // Attach event handlers to bars and milestones
    #updateBarEvents() {
        const self = this;
        const barDrag         = this.#createBarDrag();
        const milestoneDrag   = this.#createMilestoneDrag();
        const leftResizeDrag  = this.#createLeftResizeDrag();
        const rightResizeDrag = this.#createRightResizeDrag();

        // Attach resize drag to edge handles
        this.taskBars.selectAll('.task-resize-left').call(leftResizeDrag);
        this.taskBars.selectAll('.task-resize-right').call(rightResizeDrag);

        // Event handlers for regular task bars
        this.taskBars.selectAll('.task-bar')
            .call(barDrag)
            .on('mouseover', function(event, d) {
                if (self.editMode) return;
                d3.select(this).classed('highlighted', true);
                self.taskHover(event, d);
            })
            .on('mouseout', function(event, d) {
                if (self.editMode) return;
                d3.select(this).classed('highlighted', false);
                self.taskOut(event, d);
            })
            .on('click', function(event, d) {
                if (self.editMode) return;
                self.taskClick(event, d);
            });

        // Event handlers for milestone diamonds
        this.taskBars.selectAll('.milestone-diamond')
            .call(milestoneDrag)
            .on('mouseover', function(event, d) {
                if (self.editMode) return;
                d3.select(this).classed('highlighted', true);
                self.taskHover(event, d);
            })
            .on('mouseout', function(event, d) {
                if (self.editMode) return;
                d3.select(this).classed('highlighted', false);
                self.taskOut(event, d);
            })
            .on('click', function(event, d) {
                if (self.editMode) return;
                self.taskClick(event, d);
            });
    }

    // Drag behavior for regular task bars
    #createBarDrag() {
        const self = this;
        let originalStart, originalEnd, dragStartClientX, lastClientX;
        let currentD = null, currentGroup = null;

        // Shared apply function — used by both drag events and the auto-scroll rAF
        const applyDrag = () => {
            const d     = currentD;
            const group = currentGroup;
            // Total horizontal displacement = mouse delta + extra pixels auto-scrolled
            const totalDelta = (lastClientX - dragStartClientX) + self.#autoScrollExtraPx;
            const daysDelta  = Math.round(totalDelta / self.dayWidth);
            const newStart   = d3.timeDay.offset(originalStart, daysDelta);
            const newEnd     = d3.timeDay.offset(originalEnd,   daysDelta);

            d.startDate = newStart;
            d.endDate   = newEnd;

            if (newStart < self.dateExtent[0] || newEnd > self.dateExtent[1]) {
                self.#rescaleDuringDrag();
                return;
            }

            const barX     = self.scaleX(newStart) + self.pixelShaving;
            const barWidth = Math.max(0, self.scaleX(newEnd) - self.scaleX(newStart) - self.pixelShaving * 2);

            group.select('.task-bar').attr('x', barX).attr('width', barWidth);
            group.select('.task-bar-progress')
                .attr('x', barX)
                .attr('width', barWidth * ((d.progress || 0) / 100));
            group.select('.task-resize-left').attr('x', barX);
            group.select('.task-resize-right').attr('x', barX + barWidth - 8);
            group.select('.task-resize-indicator-left').attr('x', barX + 3);
            group.select('.task-resize-indicator-right').attr('x', barX + barWidth - 6);

            // Keep dep handles in sync
            self.depHandles.selectAll('.dep-handle')
                .filter(h => h.taskId === d.id)
                .each(function(h) {
                    d3.select(this).attr('cx', h.side === 'left'
                        ? self.scaleX(d.startDate) + self.pixelShaving - self.dependencyBall
                        : self.scaleX(d.endDate)   - self.pixelShaving + self.dependencyBall);
                });

            self.taskLabels.selectAll('.task-label')
                .filter(td => td.id === d.id)
                .attr('x', barX + 8)
                .text(barWidth > 80 ? d.name : '');

            self.onTaskDateChangeLive(d);
            self.#updateDependencyLines(0);
        };

        return d3.drag()
            .filter(() => self.editMode)
            .on('start', function(event, d) {
                dragStartClientX        = event.sourceEvent.clientX;
                lastClientX             = dragStartClientX;
                originalStart           = new Date(d.startDate);
                originalEnd             = new Date(d.endDate);
                currentD                = d;
                currentGroup            = d3.select(this.parentNode);
                self.#autoScrollExtraPx = 0;
                self.#autoScrollApplyFn = applyDrag;
                d3.select(this.parentNode).classed('dragging', true);
                event.sourceEvent.stopPropagation();
            })
            .on('drag', function(event, d) {
                currentD     = d;
                currentGroup = d3.select(this.parentNode);
                lastClientX  = event.sourceEvent.clientX;
                applyDrag();
                self.#checkScrollEdge(event.sourceEvent);
            })
            .on('end', function(event, d) {
                self.#stopAutoScroll();
                d3.select(this.parentNode).classed('dragging', false);
                self.onTaskDateChange(d);
            });
    }

    // Drag behavior for milestone diamonds
    #createMilestoneDrag() {
        const self = this;
        let originalStart, dragStartClientX, lastClientX;
        let currentD = null, currentEl = null;
        const size = this.barHeight / 2;

        const applyDrag = () => {
            const d  = currentD;
            const el = currentEl;
            const totalDelta = (lastClientX - dragStartClientX) + self.#autoScrollExtraPx;
            const daysDelta  = Math.round(totalDelta / self.dayWidth);
            const newStart   = d3.timeDay.offset(originalStart, daysDelta);

            d.startDate = newStart;
            d.endDate   = new Date(newStart);

            if (newStart < self.dateExtent[0] || newStart > self.dateExtent[1]) {
                self.#rescaleDuringDrag();
                return;
            }

            const cx = self.scaleX(newStart);
            const cy = self.scaleY(d.id) + self.scaleY.bandwidth() / 2;
            d3.select(el).attr('points',
                `${cx},${cy - size} ${cx + size},${cy} ${cx},${cy + size} ${cx - size},${cy}`);

            // Keep dep handles in sync with milestone position
            self.depHandles.selectAll('.dep-handle')
                .filter(h => h.taskId === d.id)
                .each(function(h) {
                    d3.select(this).attr('cx', h.side === 'left'
                        ? self.scaleX(d.startDate) - size - self.dependencyBall
                        : self.scaleX(d.startDate) + size + self.dependencyBall);
                });

            self.#updateDependencyLines(0);
        };

        return d3.drag()
            .filter(() => self.editMode)
            .on('start', function(event, d) {
                dragStartClientX        = event.sourceEvent.clientX;
                lastClientX             = dragStartClientX;
                originalStart           = new Date(d.startDate);
                currentD                = d;
                currentEl               = this;
                self.#autoScrollExtraPx = 0;
                self.#autoScrollApplyFn = applyDrag;
                event.sourceEvent.stopPropagation();
            })
            .on('drag', function(event, d) {
                currentD    = d;
                currentEl   = this;
                lastClientX = event.sourceEvent.clientX;
                applyDrag();
                self.#checkScrollEdge(event.sourceEvent);
            })
            .on('end', function(event, d) {
                self.#stopAutoScroll();
                self.onTaskDateChange(d);
            });
    }

    // Drag behavior for left edge of task bar — changes start date only
    #createLeftResizeDrag() {
        const self = this;
        let originalStart, originalEnd, dragStartClientX, lastClientX;
        let currentD = null, currentGroup = null;

        const applyDrag = () => {
            const d     = currentD;
            const group = currentGroup;
            const totalDelta = (lastClientX - dragStartClientX) + self.#autoScrollExtraPx;
            const daysDelta  = Math.round(totalDelta / self.dayWidth);

            // New start, clamped so task stays at least 1 day long
            let newStart = d3.timeDay.offset(originalStart, daysDelta);
            if (newStart >= originalEnd) newStart = d3.timeDay.offset(originalEnd, -1);
            d.startDate = newStart;

            if (newStart < self.dateExtent[0]) {
                self.#rescaleDuringDrag();
                return;
            }

            const barX     = self.scaleX(newStart) + self.pixelShaving;
            const barWidth = Math.max(0, self.scaleX(d.endDate) - self.scaleX(newStart) - self.pixelShaving * 2);

            group.select('.task-bar').attr('x', barX).attr('width', barWidth);
            group.select('.task-bar-progress')
                .attr('x', barX)
                .attr('width', barWidth * ((d.progress || 0) / 100));
            group.select('.task-resize-left').attr('x', barX);
            group.select('.task-resize-right').attr('x', barX + barWidth - 8);
            group.select('.task-resize-indicator-left').attr('x', barX + 3);
            group.select('.task-resize-indicator-right').attr('x', barX + barWidth - 6);

            // Keep dep handles in sync
            self.depHandles.selectAll('.dep-handle')
                .filter(h => h.taskId === d.id)
                .each(function(h) {
                    d3.select(this).attr('cx', h.side === 'left'
                        ? self.scaleX(d.startDate) + self.pixelShaving - self.dependencyBall
                        : self.scaleX(d.endDate)   - self.pixelShaving + self.dependencyBall);
                });

            self.taskLabels.selectAll('.task-label')
                .filter(td => td.id === d.id)
                .attr('x', barX + 8)
                .text(barWidth > 80 ? d.name : '');

            self.onTaskDateChangeLive(d);
            self.#updateDependencyLines(0);
        };

        return d3.drag()
            .filter(() => self.editMode)
            .on('start', function(event, d) {
                dragStartClientX        = event.sourceEvent.clientX;
                lastClientX             = dragStartClientX;
                originalStart           = new Date(d.startDate);
                originalEnd             = new Date(d.endDate);
                currentD                = d;
                currentGroup            = d3.select(this.parentNode);
                self.#autoScrollExtraPx = 0;
                self.#autoScrollApplyFn = applyDrag;
                d3.select(this.parentNode).classed('dragging', true);
                event.sourceEvent.stopPropagation();
            })
            .on('drag', function(event, d) {
                currentD     = d;
                currentGroup = d3.select(this.parentNode);
                lastClientX  = event.sourceEvent.clientX;
                applyDrag();
                self.#checkScrollEdge(event.sourceEvent);
            })
            .on('end', function(event, d) {
                self.#stopAutoScroll();
                d3.select(this.parentNode).classed('dragging', false);
                self.onTaskDateChange(d);
            });
    }

    // Drag behavior for right edge of task bar — changes end date only
    #createRightResizeDrag() {
        const self = this;
        let originalStart, originalEnd, dragStartClientX, lastClientX;
        let currentD = null, currentGroup = null;

        const applyDrag = () => {
            const d     = currentD;
            const group = currentGroup;
            const totalDelta = (lastClientX - dragStartClientX) + self.#autoScrollExtraPx;
            const daysDelta  = Math.round(totalDelta / self.dayWidth);

            // New end, clamped so task stays at least 1 day long
            let newEnd = d3.timeDay.offset(originalEnd, daysDelta);
            if (newEnd <= originalStart) newEnd = d3.timeDay.offset(originalStart, 1);
            d.endDate = newEnd;

            if (newEnd > self.dateExtent[1]) {
                self.#rescaleDuringDrag();
                return;
            }

            const barX     = self.scaleX(d.startDate) + self.pixelShaving;
            const barWidth = Math.max(0, self.scaleX(newEnd) - self.scaleX(d.startDate) - self.pixelShaving * 2);

            group.select('.task-bar').attr('x', barX).attr('width', barWidth);
            group.select('.task-bar-progress')
                .attr('x', barX)
                .attr('width', barWidth * ((d.progress || 0) / 100));
            group.select('.task-resize-left').attr('x', barX);
            group.select('.task-resize-right').attr('x', barX + barWidth - 8);
            group.select('.task-resize-indicator-right').attr('x', barX + barWidth - 6);

            // Keep dep handles in sync
            self.depHandles.selectAll('.dep-handle')
                .filter(h => h.taskId === d.id)
                .each(function(h) {
                    d3.select(this).attr('cx', h.side === 'left'
                        ? self.scaleX(d.startDate) + self.pixelShaving - self.dependencyBall
                        : self.scaleX(d.endDate)   - self.pixelShaving + self.dependencyBall);
                });

            self.taskLabels.selectAll('.task-label')
                .filter(td => td.id === d.id)
                .attr('x', barX + 8)
                .text(barWidth > 80 ? d.name : '');

            self.onTaskDateChangeLive(d);
            self.#updateDependencyLines(0);
        };

        return d3.drag()
            .filter(() => self.editMode)
            .on('start', function(event, d) {
                dragStartClientX        = event.sourceEvent.clientX;
                lastClientX             = dragStartClientX;
                originalStart           = new Date(d.startDate);
                originalEnd             = new Date(d.endDate);
                currentD                = d;
                currentGroup            = d3.select(this.parentNode);
                self.#autoScrollExtraPx = 0;
                self.#autoScrollApplyFn = applyDrag;
                d3.select(this.parentNode).classed('dragging', true);
                event.sourceEvent.stopPropagation();
            })
            .on('drag', function(event, d) {
                currentD     = d;
                currentGroup = d3.select(this.parentNode);
                lastClientX  = event.sourceEvent.clientX;
                applyDrag();
                self.#checkScrollEdge(event.sourceEvent);
            })
            .on('end', function(event, d) {
                self.#stopAutoScroll();
                d3.select(this.parentNode).classed('dragging', false);
                self.onTaskDateChange(d);
            });
    }

    // rAF tick: scroll the container and reposition the dragged element
    #doAutoScroll() {
        if (!this.#autoScrollApplyFn || this.#autoScrollSpeed === 0) {
            this.#autoScrollRAF = null;
            return;
        }
        const container = this.container.node().parentElement;
        const before = container.scrollLeft;
        container.scrollLeft += this.#autoScrollSpeed;
        // Track actual pixels scrolled (stops at scroll boundaries)
        this.#autoScrollExtraPx += container.scrollLeft - before;
        this.#autoScrollApplyFn();
        this.#autoScrollRAF = requestAnimationFrame(() => this.#doAutoScroll());
    }

    // Detect proximity to left/right edge of the scroll container and set scroll speed
    #checkScrollEdge(sourceEvent) {
        const container = this.container.node().parentElement;
        const rect = container.getBoundingClientRect();
        const x = sourceEvent.clientX;
        const edgeZone = 80; // px from edge that triggers auto-scroll

        if (x < rect.left + edgeZone) {
            this.#autoScrollSpeed = -Math.round(((edgeZone - (x - rect.left)) / edgeZone) * 12);
        } else if (x > rect.right - edgeZone) {
            this.#autoScrollSpeed = Math.round(((x - (rect.right - edgeZone)) / edgeZone) * 12);
        } else {
            this.#autoScrollSpeed = 0;
        }

        // Start the rAF loop if not already running
        if (this.#autoScrollSpeed !== 0 && this.#autoScrollRAF === null) {
            this.#autoScrollRAF = requestAnimationFrame(() => this.#doAutoScroll());
        }
    }

    // Cancel auto-scroll and reset all state
    #stopAutoScroll() {
        if (this.#autoScrollRAF !== null) {
            cancelAnimationFrame(this.#autoScrollRAF);
            this.#autoScrollRAF = null;
        }
        this.#autoScrollSpeed = 0;
        this.#autoScrollApplyFn = null;
        this.#autoScrollExtraPx = 0;
    }

    // Instantly reposition everything when a drag pushes dates outside the current scale.
    // Recalculates dateExtent + scaleX, resizes the SVG, and redraws all elements
    // without D3 transitions so the update feels live.
    #rescaleDuringDrag() {
        // Recalculate the date extent and x-scale from the live task data
        this.#updateScales();

        const milestoneSize = this.barHeight / 2;
        const self = this;

        // Reposition all regular task bars
        this.taskBars.selectAll('.task-bar-group').each(function(d) {
            const g       = d3.select(this);
            const barX    = self.scaleX(d.startDate) + self.pixelShaving;
            const barWidth = Math.max(0,
                self.scaleX(d.endDate) - self.scaleX(d.startDate) - self.pixelShaving * 2);
            g.select('.task-bar').attr('x', barX).attr('width', barWidth);
            g.select('.task-bar-progress')
                .attr('x', barX)
                .attr('width', barWidth * ((d.progress || 0) / 100));
            g.select('.task-resize-left').attr('x', barX);
            g.select('.task-resize-right').attr('x', barX + barWidth - 8);
            g.select('.task-resize-indicator-left').attr('x', barX + 3);
            g.select('.task-resize-indicator-right').attr('x', barX + barWidth - 6);
        });

        // Reposition milestone diamonds
        this.taskBars.selectAll('.milestone-group').each(function(d) {
            const cx = self.scaleX(d.startDate);
            const cy = self.scaleY(d.id) + self.scaleY.bandwidth() / 2;
            d3.select(this).select('.milestone-diamond').attr('points',
                `${cx},${cy - milestoneSize} ${cx + milestoneSize},${cy} ${cx},${cy + milestoneSize} ${cx - milestoneSize},${cy}`);
        });

        // Reposition all bar labels
        this.taskLabels.selectAll('.task-label').each(function(d) {
            const barX    = self.scaleX(d.startDate) + 8;
            const barWidth = self.scaleX(d.endDate) - self.scaleX(d.startDate);
            d3.select(this).attr('x', barX).text(barWidth > 80 ? d.name : '');
        });

        // Reposition subtask bar labels
        this.taskLabels.selectAll('.subtask-label').each(function(d) {
            const barX    = self.scaleX(d.startDate) + 5;
            const barWidth = self.scaleX(d.endDate) - self.scaleX(d.startDate);
            d3.select(this).attr('x', barX).text(barWidth > 50 ? d.name : '');
        });

        // Reposition dep handles
        const msSize = milestoneSize;
        this.depHandles.selectAll('.dep-handle').each(function(h) {
            const t = self.data.find(task => task.id === h.taskId);
            if (!t) return;
            const cy = self.scaleY(t.id) + self.scaleY.bandwidth() / 2;
            const cx = t.isMilestone
                ? (h.side === 'left' ? self.scaleX(t.startDate) - msSize - self.dependencyBall : self.scaleX(t.startDate) + msSize + self.dependencyBall)
                : (h.side === 'left' ? self.scaleX(t.startDate) + self.pixelShaving - self.dependencyBall : self.scaleX(t.endDate) - self.pixelShaving + self.dependencyBall);
            d3.select(this).attr('cx', cx).attr('cy', cy);
        });

        // Redraw axes, grid, today line, project bounds, dependency lines — all instant
        this.#updateAxisDays();
        this.#updateAxisMonths();
        this.#updateGridLines();
        this.#updateRowBackgrounds();
        this.#updateTodayLine();
        this.#updateProjectBounds();
        this.#updateDependencyLines(0);
    }

    // Draw task labels inside bars and next to milestones
    #updateLabels() {
        // Separate regular tasks and milestones (exclude subtasks and markers)
        const regularTasks = this.data.filter(d => !d.isMilestone && !d.isSubtask && !d.isAddSubtaskMarker);
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

        // Labels for subtask bars (smaller font, lower width threshold)
        const subtasks = this.data.filter(d => d.isSubtask);
        this.taskLabels.selectAll('.subtask-label')
            .data(subtasks, d => d.id)
            .join(
                enter => enter.append('text')
                    .attr('class', 'subtask-label')
                    .attr('x', d => this.scaleX(d.startDate) + 5)
                    .attr('y', d => this.scaleY(d.id) + this.scaleY.bandwidth() / 2)
                    .attr('dy', '0.35em')
                    .text(d => {
                        const barWidth = this.scaleX(d.endDate) - this.scaleX(d.startDate);
                        return barWidth > 50 ? d.name : '';
                    })
                    .style('opacity', 0),
                update => update,
                exit => exit.remove()
            )
            .transition().duration(500)
            .attr('x', d => this.scaleX(d.startDate) + 5)
            .attr('y', d => this.scaleY(d.id) + this.scaleY.bandwidth() / 2)
            .text(d => {
                const barWidth = this.scaleX(d.endDate) - this.scaleX(d.startDate);
                return barWidth > 50 ? d.name : '';
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

    // Draw vertical marker lines at project start and project deadline
    #updateProjectBounds() {
        this.projectBoundsLayer.selectAll('*').remove();
        if (!this.dateExtent) return;

        const drawMarker = (date, lineClass, labelClass, labelText) => {
            if (!date) return;
            if (date < this.dateExtent[0] || date > this.dateExtent[1]) return;
            const x = this.scaleX(date);
            this.projectBoundsLayer.append('line')
                .attr('class', lineClass)
                .attr('x1', x).attr('y1', 0)
                .attr('x2', x).attr('y2', this.chartHeight);
            this.projectBoundsLayer.append('text')
                .attr('class', labelClass)
                .attr('x', x + 4)
                .attr('y', -10)
                .text(labelText);
        };

        drawMarker(this.projectStart, 'project-start-line', 'project-start-label', 'Project Start');
        drawMarker(this.projectEnd,   'project-deadline-line', 'project-deadline-label', 'Deadline');
    }

    // Draw dependency lines between tasks
    // duration=0 skips the fade-in animation (used during drag for live updates)
    #updateDependencyLines(duration = 500) {
        const self = this;
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
                // Mini line connector points that touch the bar edges
                let miniLineBegining, miniLineEnd;

                const moveOver = 2; // Move the line a bit to prevent overlap with bar borders

                if (dep.dependencyType === 'start-to-start') { //todo: for further types if i wanna continue taht path
                    startX = this.scaleX(predecessor.startDate);
                    endX = this.scaleX(successor.startDate);
                    miniLineBegining = this.scaleX(predecessor.startDate) + this.pixelShaving + moveOver;
                    miniLineEnd = this.scaleX(successor.startDate) + this.pixelShaving + moveOver;
                } else {
                    startX = this.scaleX(predecessor.endDate);
                    endX = this.scaleX(successor.startDate);
                    miniLineBegining = this.scaleX(predecessor.endDate) - this.pixelShaving + moveOver;
                    miniLineEnd = this.scaleX(successor.startDate) + this.pixelShaving + moveOver;
                }

                const showMiniLines = endX >= startX;

                // In the backward case (successor starts before predecessor ends), the mini
                // connectors are hidden but startX/endX still carry the pixelShaving offset,
                // leaving a visible nub past the bar edge. Clamp them to the bar's visual edges.
                let adjustedStartX = startX;
                let adjustedEndX = endX;
                if (!showMiniLines) {
                    adjustedStartX = dep.dependencyType === 'start-to-start'
                        ? this.scaleX(predecessor.startDate) + this.pixelShaving
                        : this.scaleX(predecessor.endDate) - this.pixelShaving;
                    adjustedEndX = this.scaleX(successor.startDate) + this.pixelShaving;
                }

                // Rule: for finish-to-start, pred must end before succ starts;
                //       for start-to-start, pred must start before succ starts.
                const isViolated = dep.dependencyType === 'start-to-start'
                    ? predecessor.startDate > successor.startDate
                    : predecessor.endDate > successor.startDate;

                return {
                    id: dep.id,
                    miniLineBegining, // where the predecessor bar edge is
                    startX: adjustedStartX, // where the main line starts
                    startY: predecessorY,
                    endX: adjustedEndX,     // where the main line ends
                    endY: successorY,
                    miniLineEnd,      // where the successor bar edge is
                    type: dep.dependencyType,
                    // Don't draw nubs when the successor starts before the predecessor ends
                    showMiniLines,
                    isViolated
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
                        .attr('class', d => `dependency-group${d.isViolated ? ' dependency-violated' : ''}`);

                    // Line 1: Connector from predecessor bar edge to main line start
                    g.append('line')
                        .attr('class', 'dependency-line dependency-connector')
                        .attr('x1', d => d.miniLineBegining)
                        .attr('y1', d => d.startY)
                        .attr('x2', d => d.startX)
                        .attr('y2', d => d.startY)
                        .style('display', d => d.showMiniLines ? null : 'none');

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
                        .attr('x2', d => d.miniLineEnd)
                        .attr('y2', d => d.endY)
                        .style('display', d => d.showMiniLines ? null : 'none');

                    // Wide transparent hit area — makes the thin line easy to hover/click
                    g.append('path')
                        .attr('class', 'dependency-hit')
                        .attr('d', d => lineGenerator([{ x: d.startX, y: d.startY }, { x: d.endX, y: d.endY }]))
                        .attr('fill', 'none')
                        .attr('stroke', 'transparent')
                        .attr('stroke-width', 14)
                        .on('mouseover.dep-delete', function(event, d) {
                            if (!self.editMode || self.#depDragActive) return;
                            d3.select(this.parentNode).selectAll('.dependency-line')
                                .style('stroke', '#ef4444');
                        })
                        .on('mouseout.dep-delete', function(event, d) {
                            d3.select(this.parentNode).selectAll('.dependency-line')
                                .style('stroke', null);
                        })
                        .on('click.dep-delete', function(event, d) {
                            if (!self.editMode) return;
                            event.stopPropagation();
                            self.onDependencyDelete(d.id);
                        });

                    g.style('opacity', 0);
                    return g;
                },
                update => update,
                exit => exit.transition().duration(300)
                    .style('opacity', 0)
                    .remove()
            );

        // Animate in — during drag (duration=0) set opacity synchronously so
        // lines aren't invisible between redraws (D3 transitions are async even
        // with duration=0, so they'd never fire before the next drag event clears them)
        if (duration > 0) {
            groups.transition().duration(duration).style('opacity', 1);
        } else {
            groups.style('opacity', 1);
        }
    }

    // =============== DEPENDENCY HANDLES ===============

    // Draw small connection circles at bar edges (shown only in edit mode via CSS)
    #updateDepHandles() {
        if (!this.data || this.data.length === 0) {
            this.depHandles.selectAll('*').remove();
            return;
        }
        const ms = this.barHeight / 2;
        const handles = [];
        // Subtasks and add-subtask markers don't get dependency handles
        this.data.filter(d => !d.isSubtask && !d.isAddSubtaskMarker).forEach(d => {
            const cy = this.scaleY(d.id) + this.scaleY.bandwidth() / 2;
            if (d.isMilestone) {
                const cx = this.scaleX(d.startDate);
                handles.push({ taskId: d.id, side: 'right', cx: cx + ms + this.dependencyBall, cy, colour: d.colour });
                handles.push({ taskId: d.id, side: 'left',  cx: cx - ms - this.dependencyBall, cy, colour: d.colour });
            } else {
                handles.push({ taskId: d.id, side: 'right', cx: this.scaleX(d.endDate)   - this.pixelShaving + this.dependencyBall, cy, colour: d.colour });
                handles.push({ taskId: d.id, side: 'left',  cx: this.scaleX(d.startDate) + this.pixelShaving - this.dependencyBall, cy, colour: d.colour });
            }
        });
        this.depHandles.selectAll('.dep-handle')
            .data(handles, d => `${d.taskId}-${d.side}`)
            .join(
                enter => enter.append('circle')
                    .attr('class', d => `dep-handle dep-handle-${d.side}`)
                    .attr('r', 5)
                    .attr('fill', 'white')
                    .attr('stroke-width', 2),
                update => update,
                exit => exit.remove()
            )
            .attr('cx', d => d.cx)
            .attr('cy', d => d.cy)
            .attr('stroke', d => d.colour || '#3b82f6');
    }

    // Wire mousedown + hover/out on dep handle circles.
    // Called from enableEditMode() and re-called from render() when already in edit mode.
    #wireDepHandleMousedown() {
        const self = this;
        this.depHandles.selectAll('.dep-handle')
            .on('mousedown.dep', function(event, d) {
                if (!self.editMode) return;
                event.stopPropagation();
                event.preventDefault();

                self.#depDragActive    = true;
                self.#depDragStartId   = d.taskId;
                self.#depDragStartSide = d.side;

                // Read current rendered position (may differ from datum if bar was dragged)
                const startCx = +d3.select(this).attr('cx');
                const startCy = +d3.select(this).attr('cy');
                self.#depDragLine = self.depDragLayer.append('line')
                    .attr('class', 'dep-drag-line')
                    .attr('x1', startCx).attr('y1', startCy)
                    .attr('x2', startCx).attr('y2', startCy);
            })
            .on('mouseover.dep', function() {
                if (!self.editMode) return;
                d3.select(this).attr('r', 7);
            })
            .on('mouseout.dep', function() {
                if (!d3.select(this).classed('dep-handle-target')) {
                    d3.select(this).attr('r', 5);
                }
            });
    }

    // mousemove handler while a dep-drag is in progress
    #onDepMouseMove(e) {
        if (!this.#depDragActive || !this.#depDragLine) return;
        const svgRect = this.svg.node().getBoundingClientRect();
        const chartX  = e.clientX - svgRect.left - this.margin.left;
        const chartY  = e.clientY - svgRect.top  - this.margin.top;
        this.#depDragLine.attr('x2', chartX).attr('y2', chartY);

        // Reset all handles to normal appearance
        this.depHandles.selectAll('.dep-handle')
            .classed('dep-handle-target', false)
            .attr('r', 5)
            .attr('fill', 'white')
            .attr('stroke', h => h.colour || '#3b82f6');

        // Highlight the handle the cursor is hovering over (different task only)
        const el = document.elementFromPoint(e.clientX, e.clientY);
        if (el && el.classList.contains('dep-handle')) {
            const h = d3.select(el).datum();
            if (h && h.taskId !== this.#depDragStartId) {
                d3.select(el)
                    .classed('dep-handle-target', true)
                    .attr('r', 8)
                    .attr('fill', '#10b981')
                    .attr('stroke', 'white');
            }
        }
    }

    // mouseup handler — completes or cancels a dep-drag
    #onDepMouseUp(e) {
        if (!this.#depDragActive) return;
        this.#depDragActive = false;

        if (this.#depDragLine) { this.#depDragLine.remove(); this.#depDragLine = null; }

        // Reset all handles
        this.depHandles.selectAll('.dep-handle')
            .classed('dep-handle-target', false)
            .attr('r', 5)
            .attr('fill', 'white')
            .attr('stroke', h => h.colour || '#3b82f6');

        // Reset any dep lines that were highlighted red (in case mouseout didn't fire)
        this.dependencyLines.selectAll('.dependency-line')
            .style('stroke', null);

        // Check if the drag ended on a valid target handle
        const el = document.elementFromPoint(e.clientX, e.clientY);
        if (el && el.classList.contains('dep-handle')) {
            const targetDatum = d3.select(el).datum();
            if (targetDatum && targetDatum.taskId !== this.#depDragStartId) {
                // Determine type from which sides were connected
                const type = (this.#depDragStartSide === 'left' && targetDatum.side === 'left')
                    ? 'start-to-start'
                    : 'finish-to-start';
                this.onDependencyCreate(this.#depDragStartId, targetDatum.taskId, type);
            }
        }

        this.#depDragStartId   = null;
        this.#depDragStartSide = null;
    }

    // Set dependencies data
    setDependencies(dependencies) {
        this.dependencies = dependencies || [];
        if (this.data.length > 0) {
            this.#updateDependencyLines();
        }
        return this;
    }

    // Store project boundary dates and redraw markers immediately
    setProjectBounds(start, end) {
        this.projectStart = start || null;
        this.projectEnd   = end   || null;
        if (this.data && this.data.length > 0) this.#updateProjectBounds();
        return this;
    }

    // Array of task objects
    render(taskData) {
        this.data = taskData || [];

        if (this.data.length === 0) {
            // Still set up the scale and axis so the user can drop the first task.
            // #calculateDateExtent() returns a sensible default range when data is empty.
            this.#updateScales();
            // Override height to a reasonable minimum so the chart area is visible
            this.svg.attr('height', this.margin.top + this.margin.bottom + 120);
            this.#updateAxisDays();
            this.#updateAxisMonths();
            this.#updateGridLines();
            this.#updateTodayLine();
            this.#updateProjectBounds();
            // Clear any leftover task elements from a previous render
            this.rowBackgrounds.selectAll('*').remove();
            this.taskBars.selectAll('*').remove();
            this.taskLabels.selectAll('*').remove();
            this.dependencyLines.selectAll('*').remove();
            this.depHandles.selectAll('*').remove();
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
        this.#updateProjectBounds();
        this.#updateDepHandles();
        if (this.editMode) this.#wireDepHandleMousedown();

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

    // Scroll to centre a task's bar in the viewport
    scrollToTask(taskId) {
        const task = this.data.find(d => d.id === taskId);
        if (!task) return this;

        // Scroll so the start of the task is near the left edge (with a small margin)
        const startX = this.scaleX(task.startDate);
        const scrollX = Math.max(0, startX - 48);

        this.container.node().parentElement.scrollLeft = scrollX;
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

    // Move the axis header groups to follow vertical scroll so they stay pinned at the top
    updateAxisScroll(scrollTop) {
        this.axisBackground.attr('transform', `translate(0, ${scrollTop})`);
        this.axisX.attr('transform', `translate(${this.margin.left}, ${scrollTop + this.margin.top - 5})`);
        this.axisXMonths.attr('transform', `translate(${this.margin.left}, ${scrollTop + 15})`);
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

    // =============== DROP PREVIEW ===============

    // Show a ghost bar/diamond on the chart while dragging a new task from the panel.
    // cursorY is the mouse Y relative to the chartArea (i.e. already offset by margin.top).
    showDropPreview(startDate, endDate, label, colour, isMilestone, cursorY) {
        this.hideDropPreview();
        if (!this.scaleX || !this.scaleY || !startDate) return this;

        // Snap to whichever row the cursor is hovering over
        const step      = this.scaleY.step();
        const bandwidth = this.scaleY.bandwidth();
        const rowIndex  = Math.max(0, Math.min(
            this.data.length - 1,
            Math.floor(cursorY / this.rowHeight)
        ));
        const rowTop = this.scaleY.paddingOuter() * step + rowIndex * step;

        if (isMilestone) {
            const cx   = this.scaleX(startDate);
            const cy   = rowTop + bandwidth / 2;
            const size = this.barHeight / 2;
            this.dropPreview.append('polygon')
                .attr('points', `${cx},${cy - size} ${cx + size},${cy} ${cx},${cy + size} ${cx - size},${cy}`)
                .attr('fill', colour || '#f59e0b')
                .attr('opacity', 0.55)
                .attr('stroke', 'white')
                .attr('stroke-width', 1.5)
                .attr('stroke-dasharray', '3,2');
        } else {
            const barX = this.scaleX(startDate) + this.pixelShaving;
            const barW = Math.max(4, this.scaleX(endDate) - this.scaleX(startDate) - this.pixelShaving * 2);
            const barY = rowTop + (bandwidth - this.barHeight) / 2;

            // Subtle row highlight
            this.dropPreview.append('rect')
                .attr('x', 0)
                .attr('y', rowTop)
                .attr('width', this.chartWidth)
                .attr('height', step)
                .attr('fill', colour || '#3b82f6')
                .attr('opacity', 0.07);

            // Dashed semi-transparent bar
            this.dropPreview.append('rect')
                .attr('x', barX)
                .attr('y', barY)
                .attr('width', barW)
                .attr('height', this.barHeight)
                .attr('rx', 3)
                .attr('ry', 3)
                .attr('fill', colour || '#3b82f6')
                .attr('opacity', 0.45)
                .attr('stroke', 'white')
                .attr('stroke-width', 1)
                .attr('stroke-dasharray', '5,3');

            // Label inside preview bar
            if (barW > 50) {
                this.dropPreview.append('text')
                    .attr('x', barX + 8)
                    .attr('y', barY + this.barHeight / 2)
                    .attr('dy', '0.35em')
                    .style('font-size', '11px')
                    .style('font-family', "'Source Sans Pro', sans-serif")
                    .style('font-weight', '500')
                    .style('fill', 'white')
                    .style('opacity', '0.9')
                    .attr('pointer-events', 'none')
                    .text(label || 'New Task');
            }
        }
        return this;
    }

    hideDropPreview() {
        if (this.dropPreview) this.dropPreview.selectAll('*').remove();
        return this;
    }

    // =============== EDIT MODE ===============

    enableEditMode() {
        this.editMode = true;
        this.svg.classed('edit-mode', true);
        this.#updateBarEvents();
        this.#wireDepHandleMousedown();
        // Add document-level listeners once per edit-mode session
        this.#depBoundMouseMove = (e) => this.#onDepMouseMove(e);
        this.#depBoundMouseUp   = (e) => this.#onDepMouseUp(e);
        document.addEventListener('mousemove', this.#depBoundMouseMove);
        document.addEventListener('mouseup',   this.#depBoundMouseUp);
        return this;
    }

    disableEditMode() {
        this.editMode = false;
        this.svg.classed('edit-mode', false);
        this.#updateBarEvents();
        if (this.#depBoundMouseMove) document.removeEventListener('mousemove', this.#depBoundMouseMove);
        if (this.#depBoundMouseUp)   document.removeEventListener('mouseup',   this.#depBoundMouseUp);
        this.#depBoundMouseMove = null;
        this.#depBoundMouseUp   = null;
        return this;
    }

    setTaskDateChange(callback = () => {}) {
        this.onTaskDateChange = callback;
        return this;
    }

    setTaskDateChangeLive(callback = () => {}) {
        this.onTaskDateChangeLive = callback;
        return this;
    }

    setOnDependencyCreate(callback = () => {}) {
        this.onDependencyCreate = callback;
        return this;
    }

    setOnDependencyDelete(callback = () => {}) {
        this.onDependencyDelete = callback;
        return this;
    }

    // Returns any dependencies that violate their scheduling rule.
    // finish-to-start: pred.endDate must be <= succ.startDate
    // start-to-start:  pred.startDate must be <= succ.startDate
    getViolatedDependencies() {
        const taskMap = new Map(this.data.map(t => [t.id, t]));
        return this.dependencies.filter(dep => {
            const pred = taskMap.get(dep.predecessorTaskId);
            const succ = taskMap.get(dep.successorTaskId);
            if (!pred || !succ) return false;
            return dep.dependencyType === 'start-to-start'
                ? pred.startDate > succ.startDate
                : pred.endDate > succ.startDate;
        });
    }

    // Update just the progress bar overlay for one task without a full re-render
    updateTaskProgress(taskId, progress) {
        const task = this.data.find(d => d.id === taskId);
        if (!task) return this;
        task.progress = progress;

        this.taskBars.selectAll('.task-bar-group')
            .filter(d => d.id === taskId)
            .select('.task-bar-progress')
            .transition().duration(300)
            .attr('width', d => {
                const fullWidth = this.scaleX(d.endDate) - this.scaleX(d.startDate) - (this.pixelShaving * 2);
                return Math.max(0, fullWidth * (progress / 100));
            });

        return this;
    }

    // Update just the progress bar overlay for a subtask without a full re-render
    updateSubtaskProgress(subtaskId, progress) {
        const syntheticId = 1_000_000 + subtaskId;
        const sub = this.data.find(d => d.id === syntheticId);
        if (sub) sub.progress = progress;

        this.taskBars.selectAll('.subtask-bar-group')
            .filter(d => d.id === syntheticId)
            .select('.subtask-bar-progress')
            .transition().duration(300)
            .attr('width', d => {
                const fullWidth = this.scaleX(d.endDate) - this.scaleX(d.startDate) - this.pixelShaving * 2;
                return Math.max(0, fullWidth * (progress / 100));
            });

        return this;
    }

    setOnSubtaskBarClick(cb) { this.onSubtaskBarClick = cb; return this; }
}
