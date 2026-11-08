# Honours-Project-2025 - Interactive Gantt Chart Builder

Building an interactive Gantt chart builder for an honours project (Heriot-Watt University)

An interactive, web-based Gantt chart builder designed for honours project students at Heriot-Watt University. Developed as part of a BSc (Hons) Computer Science dissertation supervised by Dr Pierre Le Bras.

The tool provides structured guidance to help students create comprehensive project plans for their dissertations, whilst giving supervisors view-only access to monitor progress and planning quality.

## About the Project

Gantt charts are the fourth most widely used project management tool among professionals, yet their application to individual student dissertation contexts remains underexplored. Most existing tools are built for team-based enterprise environments and can feel overly complex for a student managing a single, long-running academic project.

This project addresses that gap with a lightweight, interactive Gantt chart tool tailored to the needs of individual honours students, with a view to integrating it into the existing HWU project management system at projects.hw.ac.uk.
## Features

### Core Functionality
- Project creation with title, description, and date boundaries
- Task creation, editing, and deletion with names, descriptions, dates, and tags
- Milestone creation for key deliverables and deadlines
- Finish-to-Start task dependencies with interactive drag-to-connect handles
- Persistent data storage via SQLite

### Interactive Visualisation
- D3.js-based Gantt chart rendered as a multi-layer SVG
- Drag-and-drop timeline adjustment with day-snapping
- Left and right edge resize handles for adjusting task durations
- Timeline zoom and pan controls with a "Go to Today" shortcut
- Sticky date headers (day and month) that remain visible while scrolling
- Hover tooltips showing task name, dates, duration, and progress
- Drag-to-place ghost preview when adding new tasks from the side panel

### Planning and Tracking
- Progress tracking (0–100%) with animated bar overlays
- Schedule status indicators: green border for complete, amber border for at-risk
- Task hierarchy with expandable subtasks under parent tasks
- Task categories/tags with colour coding (Research, Planning, Design, Implementation, Testing, Evaluation, Writing)
- Cycle detection on dependency creation to prevent impossible schedules
- Real-time dependency violation highlighting during drag

### Alternative Views and Export
- Kanban board view organising tasks by status (Not Started / In Progress / Completed)
- Live progress sliders on Kanban cards that sync back to the Gantt chart
- Export as PDF or JPEG at 2× resolution for inclusion in documentation

### Supervisor Features
- View-only access for supervisors
- Threaded comment and feedback system on projects

### Onboarding
- Eight-slide tutorial modal with live mini-Gantt demonstrations
- Inline validation on task creation (preventing end dates before start dates)

## Tech Stack

- **Backend:** Node.js with Express
- **Database:** SQLite (via better-sqlite3)
- **Frontend:** HTML, CSS, JavaScript
- **Visualisation:** D3.js
- **Export:** jsPDF

## Project Structure

src/
├── login-system/
│   ├── server.js                    # Express server and all REST API routes
│   ├── database/
│   │   ├── setup.js                 # Schema creation and migrations
│   │   └── gantt.db                 # SQLite database file
│   └── public/                                                                                                                                                       
│       └── js/login-system.js       # Dashboard UI
└── gantt-builder/                                                                                                                                                    
    └── public/ 
        ├── gantt-chart.html         # Main Gantt chart page
        └── js/                                                                                                                                                       
            ├── gantt-chart.js       # GanttChart class (D3 rendering)
            ├── interactive-chart.js  # Page controller and edit logic                                                                                                
            ├── task-list.js         # Task list panel
            ├── tooltip.js           # TooltipManager class                                                                                                           
            ├── tutorial.js          # Tutorial modal
            └── load-gantt.js        # Role-based initialisation                                                                                                      
                                                                                                                                                                    
## Database Schema
                                                                                                                                                                    
The schema consists of eight tables: `students`, `student_projects`, `tasks`, `dependencies`, `subtasks`, `supervisors`, `supervisor_projects`, and `comments`.

Notable design choices:
- All dates are stored as `TEXT` in `YYYY-MM-DD` ISO 8601 format (SQLite has no native date type) and parsed client-side using `d3.timeParse`
- The `tasks` table uses a self-referencing `parent_task_id` foreign key for hierarchy                                                                                
- A `CHECK` constraint on `progress_percentage` enforces the 0–100 range
- Schema changes on startup are idempotent using `ALTER TABLE ... ADD COLUMN` wrapped in error handlers                                                               
                                                                                                                                                                    
## Getting Started
Supervisor: Pierre Le Bras

Current stakeholders: Kayvan Karim, Pierre Le Bras


Database structure:
projectId 

# To run

cd \Users\frase\Documents\GitHub\Honours-Project-2025\src\login-system
(might need to change the file path but it follows \Honours-Project-2025\src\login-system)
npm run dev

