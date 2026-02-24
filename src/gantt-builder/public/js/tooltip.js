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
