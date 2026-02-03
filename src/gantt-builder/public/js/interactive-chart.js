class GanttChart {
    // Configuration of things
    width;
    height;
    margin;
    rowHeight;
    barHeight;
    dayWidth; // Pixels per day for horizontal scrolling

    // D3 Selections
    svg;
    chartArea;
    axisX;
    axisXMonths;
    gridLines;
    rowBackgrounds;
    taskBars;
    taskLabels;
    todayLine;

    // Scales
    scaleX;
    scaleY;

    // Data
    data;
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
        const axisGen = d3.axisTop(this.scaleX)
            .ticks(d3.timeDay.every(1))
            .tickSize(0)
            .tickFormat(d => d.getDate());

        this.axisX.call(axisGen)
            .selectAll('.tick text')
            .attr('dy', -8)
            .style('font-size', '10px')
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

        this.axisXMonths.selectAll('.month-label')
            .data(months, d => d.getTime())
            .join(
                enter => enter.append('text')
                    .attr('class', 'month-label')
                    .attr('x', d => this.scaleX(d))
                    .attr('y', 0)
                    .attr('dy', '0.35em')
                    .style('font-size', '11px')
                    .style('font-weight', '600')
                    .style('fill', '#1e293b')
                    .text(d => d3.timeFormat('%B %Y')(d)),
                update => update
                    .attr('x', d => this.scaleX(d))
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

    
    // Draw task bars with animations
    #updateBars() {
        const self = this;

        // Bind data and join groups
        const bars = this.taskBars.selectAll('.task-bar-group')
            .data(this.data, d => d.id)
            .join(
                enter => {
                    const g = enter.append('g')
                        .attr('class', 'task-bar-group');

                    // Background bar (full task duration)
                    g.append('rect')
                        .attr('class', 'task-bar')
                        .attr('x', d => this.scaleX(d.startDate))
                        .attr('y', d => this.scaleY(d.id) + (this.scaleY.bandwidth() - this.barHeight) / 2)
                        .attr('width', 0)
                        .attr('height', this.barHeight)
                        .attr('rx', 4)
                        .attr('ry', 4)
                        .attr('fill', d => d.colour || '#3b82f6');

                    // Progress bar overlay
                    g.append('rect')
                        .attr('class', 'task-bar-progress')
                        .attr('x', d => this.scaleX(d.startDate))
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
            .attr('x', d => this.scaleX(d.startDate))
            .attr('y', d => this.scaleY(d.id) + (this.scaleY.bandwidth() - this.barHeight) / 2)
            .attr('width', d => Math.max(0, this.scaleX(d.endDate) - this.scaleX(d.startDate)))
            .attr('fill', d => d.colour || '#3b82f6');

        // Animate progress overlay
        bars.select('.task-bar-progress')
            .transition().duration(500)
            .attr('x', d => this.scaleX(d.startDate))
            .attr('y', d => this.scaleY(d.id) + (this.scaleY.bandwidth() - this.barHeight) / 2)
            .attr('width', d => {
                const fullWidth = this.scaleX(d.endDate) - this.scaleX(d.startDate);
                const progress = d.progress || 0;
                return Math.max(0, fullWidth * (progress / 100));
            });

        // Attach event listeners
        this.#updateBarEvents();
    }

    // Attach event handlers to bars
    #updateBarEvents() {
        const self = this;

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
    }

    // Draw task labels inside bars
    #updateLabels() {
        this.taskLabels.selectAll('.task-label')
            .data(this.data, d => d.id)
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
        this.#updateTodayLine();

        return this;
    }

    // Array of task IDs to highlight
    highlightTasks(taskIds = []) {
        this.taskBars.selectAll('.task-bar')
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
                    .html(d => `
                        <div class="task-color-dot" style="background: ${d.colour || '#3b82f6'}"></div>
                        <span class="task-name">${d.name}</span>
                        <span class="task-dates">${d3.timeFormat('%d %b')(d.startDate)}</span>
                    `),
                update => update
                    .html(d => `
                        <div class="task-color-dot" style="background: ${d.colour || '#3b82f6'}"></div>
                        <span class="task-name">${d.name}</span>
                        <span class="task-dates">${d3.timeFormat('%d %b')(d.startDate)}</span>
                    `),
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
        dates.text(`${d3.timeFormat('%d %b %Y')(data.startDate)} - ${d3.timeFormat('%d %b %Y')(data.endDate)}`);
        progress.text(`Progress: ${data.progress || 0}%`);

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
document.addEventListener('DOMContentLoaded', () => {
    // Check if chart panel exists
    const chartPanel = document.getElementById('chartPanel');
    const taskListEl = document.getElementById('taskList');

    if (!chartPanel || !taskListEl) {
        console.log('Gantt chart elements not found');
        return;
    }

    // Sample data for demonstration
    // In production, this would come from the database
    const parseDate = d3.timeParse('%Y-%m-%d');

    const sampleTaskData = [
    {
        id: 1,
        name: 'Research & Literature Review',
        start: '2025-01-06',
        end: '2025-01-24',
        colour: '#3b82f6',
        progress: 100
    },
    {
        id: 2,
        name: 'Requirements Gathering',
        start: '2025-01-20',
        end: '2025-02-07',
        colour: '#8b5cf6',
        progress: 100
    },
    {
        id: 3,
        name: 'Database Design & ERD',
        start: '2025-02-03',
        end: '2025-02-14',
        colour: '#ec4899',
        progress: 100
    },
    {
        id: 4,
        name: 'Ethics Application',
        start: '2025-02-10',
        end: '2025-02-21',
        colour: '#f59e0b',
        progress: 90
    },
    {
        id: 5,
        name: 'Authentication System Development',
        start: '2025-02-17',
        end: '2025-03-07',
        colour: '#10b981',
        progress: 75
    },
    {
        id: 6,
        name: 'Gantt Chart Visualization (D3.js)',
        start: '2025-02-24',
        end: '2025-03-21',
        colour: '#06b6d4',
        progress: 60
    },
    {
        id: 7,
        name: 'System Integration',
        start: '2025-03-17',
        end: '2025-04-04',
        colour: '#6366f1',
        progress: 30
    },
    {
        id: 8,
        name: 'Usability Testing',
        start: '2025-03-31',
        end: '2025-04-18',
        colour: '#f43f5e',
        progress: 0
    },
    {
        id: 9,
        name: 'Dissertation Writing',
        start: '2025-03-10',
        end: '2025-04-25',
        colour: '#84cc16',
        progress: 45
    },
    {
        id: 10,
        name: 'Final Review & Submission',
        start: '2025-04-21',
        end: '2025-04-30',
        colour: '#ef4444',
        progress: 0
    }
];
    // Parse dates
    const taskData = sampleTaskData.map(d => ({
        ...d,
        startDate: parseDate(d.start),
        endDate: parseDate(d.end)
    }));

    // Instantiate components
    const ganttChart = new GanttChart('#chartPanel', {
        rowHeight: 48,
        barHeight: 24,
        dayWidth: 35
    });

    const taskList = new TaskList('#taskList');
    const tooltip = new TooltipManager('#ganttTooltip');

    // Render initial data
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

    console.log('Interactive Gantt Chart initialised');
});
