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
    onTaskDateChange = () => {};

    // Edit mode state
    editMode = false;

    // Auto-scroll state (used during drag near chart edges)
    #autoScrollRAF = null;
    #autoScrollSpeed = 0;
    #autoScrollApplyFn = null;  // called each rAF frame to reposition the dragged element
    #autoScrollExtraPx = 0;     // px scrolled by rAF since drag start

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
        const barDrag = this.#createBarDrag();
        const milestoneDrag = this.#createMilestoneDrag();

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

            self.taskLabels.selectAll('.task-label')
                .filter(td => td.id === d.id)
                .attr('x', barX + 8)
                .text(barWidth > 80 ? d.name : '');

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

        // Redraw axes, grid, today line, dependency lines — all instant
        this.#updateAxisDays();
        this.#updateAxisMonths();
        this.#updateGridLines();
        this.#updateRowBackgrounds();
        this.#updateTodayLine();
        this.#updateDependencyLines(0);
    }

    // Draw task labels inside bars and next to milestones
    #updateLabels() {
        // Separate regular tasks and milestones
        const regularTasks = this.data.filter(d => !d.isMilestone);
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
    // duration=0 skips the fade-in animation (used during drag for live updates)
    #updateDependencyLines(duration = 500) {
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

                return {
                    id: dep.id,
                    miniLineBegining, // where the predecessor bar edge is
                    startX,           // where the main line starts
                    startY: predecessorY,
                    endX,             // where the main line ends
                    endY: successorY,
                    miniLineEnd,      // where the successor bar edge is
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
                        .attr('x1', d => d.miniLineBegining)
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
                        .attr('x2', d => d.miniLineEnd)
                        .attr('y2', d => d.endY);

                    g.style('opacity', 0);
                    return g;
                },
                update => update,
                exit => exit.transition().duration(300)
                    .style('opacity', 0)
                    .remove()
            );

        // Animate in (duration=0 during drag for instant update)
        groups.transition().duration(duration)
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

    // =============== EDIT MODE ===============

    enableEditMode() {
        this.editMode = true;
        this.svg.classed('edit-mode', true);
        this.#updateBarEvents();
        return this;
    }

    disableEditMode() {
        this.editMode = false;
        this.svg.classed('edit-mode', false);
        this.#updateBarEvents();
        return this;
    }

    setTaskDateChange(callback = () => {}) {
        this.onTaskDateChange = callback;
        return this;
    }
}
