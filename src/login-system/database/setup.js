// Database Setup Script for Gantt Chart Project

// Create database connection
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Create db path
const dbPath = path.join(__dirname, 'gantt.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    // Drop existing tables to reset schema (if they exist)
    db.run(`DROP TABLE IF EXISTS comments`);
    db.run(`DROP TABLE IF EXISTS supervisor_projects`);
    db.run(`DROP TABLE IF EXISTS supervisors`);
    db.run(`DROP TABLE IF EXISTS subtasks`);
    db.run(`DROP TABLE IF EXISTS dependencies`);
    db.run(`DROP TABLE IF EXISTS tasks`);
    db.run(`DROP TABLE IF EXISTS student_projects`);
    db.run(`DROP TABLE IF EXISTS students`);

    // Create students table
    db.run(`
        CREATE TABLE IF NOT EXISTS students (
            student_id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL
        )
    `);

    // Create student_projects junction table for many-to-many relationship
    db.run(`
        CREATE TABLE IF NOT EXISTS student_projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL,
            project_id INTEGER NOT NULL,
            project_name TEXT,
            project_description TEXT,
            start_date TEXT DEFAULT NULL,
            end_date TEXT DEFAULT NULL,
            FOREIGN KEY (student_id) REFERENCES students(student_id),
            UNIQUE(student_id, project_id)
        )
    `);

    // Create tasks table for Gantt chart
    db.run(`
        CREATE TABLE IF NOT EXISTS tasks (
            task_id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            task_name TEXT NOT NULL,
            description TEXT,
            start_date TEXT,
            end_date TEXT,
            duration INTEGER,
            progress_percentage INTEGER DEFAULT 0 CHECK(progress_percentage >= 0 AND progress_percentage <= 100),
            is_milestone INTEGER DEFAULT 0,
            parent_task_id INTEGER,
            display_order INTEGER DEFAULT 0,
            colour TEXT DEFAULT '#4a90d9',
            tag TEXT DEFAULT NULL,
            FOREIGN KEY (project_id) REFERENCES student_projects(project_id),
            FOREIGN KEY (parent_task_id) REFERENCES tasks(task_id)
        )
    `);

    // Create dependencies table for task relationships
    db.run(`
        CREATE TABLE IF NOT EXISTS dependencies (
            dependency_id INTEGER PRIMARY KEY AUTOINCREMENT,
            predecessor_task_id INTEGER NOT NULL,
            successor_task_id INTEGER NOT NULL,
            dependency_type TEXT NOT NULL DEFAULT 'finish-to-start',
            FOREIGN KEY (predecessor_task_id) REFERENCES tasks(task_id),
            FOREIGN KEY (successor_task_id) REFERENCES tasks(task_id)
        )
    `);

    // Create subtasks table
    db.run(`
        CREATE TABLE IF NOT EXISTS subtasks (
            subtask_id          INTEGER PRIMARY KEY AUTOINCREMENT,
            parent_task_id      INTEGER NOT NULL,
            subtask_name        TEXT NOT NULL,
            progress_percentage INTEGER DEFAULT 0 CHECK(progress_percentage >= 0 AND progress_percentage <= 100),
            start_date          TEXT NOT NULL,
            end_date            TEXT NOT NULL,
            display_order       INTEGER DEFAULT 0,
            FOREIGN KEY (parent_task_id) REFERENCES tasks(task_id)
        )
    `);

    // Create supervisors table
    db.run(`
        CREATE TABLE IF NOT EXISTS supervisors (
            supervisor_id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL
        )
    `);

    // Create supervisor_projects junction table
    db.run(`
        CREATE TABLE IF NOT EXISTS supervisor_projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            supervisor_id INTEGER NOT NULL,
            project_id INTEGER NOT NULL,
            FOREIGN KEY (supervisor_id) REFERENCES supervisors(supervisor_id),
            FOREIGN KEY (project_id) REFERENCES student_projects(project_id),
            UNIQUE(supervisor_id, project_id)
        )
    `);

    // Create comments table
    db.run(`
        CREATE TABLE IF NOT EXISTS comments (
            comment_id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            parent_comment_id INTEGER DEFAULT NULL,
            author_email TEXT NOT NULL,
            author_name TEXT NOT NULL,
            author_role TEXT NOT NULL CHECK(author_role IN ('student', 'supervisor')),
            content TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (project_id) REFERENCES student_projects(project_id),
            FOREIGN KEY (parent_comment_id) REFERENCES comments(comment_id)
        )
    `);


    // =========================================
    // Lowk anything below is not necesary as its just for seeding the database with sample data for testing and demonstration purposes. You can modify or remove this section as needed. 
    // =========================================

    // Sample students data
    const sampleStudents = [
        { email: 'fd2010@hw.ac.uk', name: 'Fraser Davies' },
        { email: 'test@hw.ac.uk', name: 'Test Student' },
        { email: 'demo@hw.ac.uk', name: 'Demo User' },
        { email: 'aa2212@hw.ac.uk', name: 'Aadham Ahmad' }
    ];

    const insertStudentStmt = db.prepare(`
        INSERT OR IGNORE INTO students (email, name)
        VALUES (?, ?)
    `);

    sampleStudents.forEach(student => {
        insertStudentStmt.run(student.email, student.name);
    });

    insertStudentStmt.finalize();

    // Sample supervisors
    const sampleSupervisors = [
        { email: 'supervisor@hw.ac.uk', name: 'Dr Pierre Le Bras' }
    ];

    const insertSupervisorStmt = db.prepare(`
        INSERT OR IGNORE INTO supervisors (email, name) VALUES (?, ?)
    `);

    sampleSupervisors.forEach(sup => {
        insertSupervisorStmt.run(sup.email, sup.name);
    });

    insertSupervisorStmt.finalize();

    // Sample project assignments (students can have multiple projects)
    // todo: lowkenuinly ask if there should be a staff mode (boolean variable)
    const sampleProjectAssignments = [
        { email: 'fd2010@hw.ac.uk', project_id: 1000, project_name: 'Interactive Gantt Chart Builder', project_description: 'This project involves the design, development, and evaluation of an interactive Gantt chart builder for integration into the existing HWU honours project management system (projects.hw.ac.uk). The tool provides structured guidance to help students create comprehensive project plans whilst offering supervisors visibility into student progress and planning quality. Key features include D3.js-based interactive visualisation with drag-and-drop, task dependencies, milestones, subtasks, progress tracking, a Kanban board view, supervisor view-only access, and PNG/JPEG export. The system is built using Node.js with Express and SQLite, and was evaluated through a usability study with 15 participants using the System Usability Scale (SUS).', start_date: '2025-09-18', end_date: '2026-04-17' },
        { email: 'fd2010@hw.ac.uk', project_id: 1001, project_name: 'Interactive Gantt Chart Builder', project_description: 'This project will see the development, evaluation and integration of an interactive Gantt chart builder for the current HWU project system. Some of the requirements may include: - Build an interface that guides students in writing correct milestones, detailed tasks, task hierarchies, and dependencies. - Generate an interactive Gantt chart for students and supervisors to explore. - Provide an export functionality to include the chart or data in a documentation. - Provide functionalities for students and supervisors to reflect on the progress of a project and reevaluate goals if needed. - Evaluate the tool and its guidance feature with a user study. - Develop and integrate the tool within the existing technological stack on which the HWU project system is built. This project will require a willingness to organise and run meetings with stakeholders (current system developers, supervisors, students, etc.). You should also be proficient with web programming, data management, UI/UX and willing to develop bespoke interactive data visualisation systems.', start_date: '2025-09-22', end_date: '2026-04-11' },
        { email: 'fd2010@hw.ac.uk', project_id: 1002, project_name: 'AI Research Tool', project_description: 'Machine learning platform for academic research analysis', start_date: null, end_date: null },
        { email: 'fd2010@hw.ac.uk', project_id: 1003, project_name: 'Database Manager', project_description: 'SQLite database management and visualisation tool', start_date: null, end_date: null },
        { email: 'test@hw.ac.uk', project_id: 1004, project_name: 'Test Project', project_description: 'A sample project for testing purposes', start_date: null, end_date: null },
        { email: 'test@hw.ac.uk', project_id: 1005, project_name: 'Another Test', project_description: 'Secondary test project for validation', start_date: null, end_date: null },
        { email: 'demo@hw.ac.uk', project_id: 1006, project_name: 'Demo Project', project_description: 'Demonstration project showcasing system features', start_date: null, end_date: null },
        { email: 'aa2212@hw.ac.uk', project_id: 1007, project_name: 'Aadham Project 1', project_description: 'First project assignment', start_date: null, end_date: null },
        { email: 'aa2212@hw.ac.uk', project_id: 1008, project_name: 'Aadham Project 2', project_description: 'Second project assignment', start_date: null, end_date: null }
    ];

    // Insert project assignments after getting student IDs
    db.all('SELECT student_id, email FROM students', [], (err, students) => {
        if (err) {
            console.error('Error fetching students:', err);
            return;
        }

        const emailToId = {};
        students.forEach(s => {
            emailToId[s.email] = s.student_id;
        });

        const insertProjectStmt = db.prepare(`
            INSERT OR IGNORE INTO student_projects (student_id, project_id, project_name, project_description, start_date, end_date)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        sampleProjectAssignments.forEach(assignment => {
            const studentId = emailToId[assignment.email];
            if (studentId) {
                insertProjectStmt.run(studentId, assignment.project_id, assignment.project_name, assignment.project_description, assignment.start_date || null, assignment.end_date || null);
            }
        });

        insertProjectStmt.finalize();

        // Link supervisors to projects (after supervisor rows exist)
        db.get('SELECT supervisor_id FROM supervisors WHERE email = ?', ['supervisor@hw.ac.uk'], (err, sup) => {
            if (sup) {
                db.run(`INSERT OR IGNORE INTO supervisor_projects (supervisor_id, project_id) VALUES (?, ?)`,
                    [sup.supervisor_id, 1000]);
                db.run(`INSERT OR IGNORE INTO supervisor_projects (supervisor_id, project_id) VALUES (?, ?)`,
                    [sup.supervisor_id, 1001]);
                db.run(`INSERT OR IGNORE INTO supervisor_projects (supervisor_id, project_id) VALUES (?, ?)`,
                    [sup.supervisor_id, 1004]);
            }
        });

        const sampleTasks = [
            // ─── Project 1001 tasks (original) ───────────────────────────────────────
            { project_id: 1001, task_name: 'Project Kickoff',                description: 'Initial supervisor meeting, project scope agreed and plan drafted',       start_date: '2025-09-22', end_date: '2025-09-22', duration: 0,  progress_percentage: 100, is_milestone: 1, parent_task_id: null, display_order: 1,  colour: '#17a2b8', tag: 'planning'        },
            { project_id: 1001, task_name: 'Literature Review',              description: 'Review existing Gantt chart tools, project management systems and HWU system architecture', start_date: '2025-09-22', end_date: '2025-10-31', duration: 39, progress_percentage: 100, is_milestone: 0, parent_task_id: null, display_order: 2,  colour: '#4a90d9', tag: 'research'        },
            { project_id: 1001, task_name: 'Requirements Gathering',         description: 'Stakeholder interviews, analysis of current HWU system and user needs', start_date: '2025-10-06', end_date: '2025-10-24', duration: 18, progress_percentage: 100, is_milestone: 0, parent_task_id: null, display_order: 3,  colour: '#17a2b8', tag: 'planning'        },
            { project_id: 1001, task_name: 'Requirements Complete',          description: 'Functional and non-functional requirements document signed off',          start_date: '2025-10-24', end_date: '2025-10-24', duration: 0,  progress_percentage: 100, is_milestone: 1, parent_task_id: null, display_order: 4,  colour: '#17a2b8', tag: 'planning'        },
            { project_id: 1001, task_name: 'System Architecture Design',     description: 'High-level architecture, technology stack decisions and component design', start_date: '2025-10-27', end_date: '2025-11-14', duration: 18, progress_percentage: 100, is_milestone: 0, parent_task_id: null, display_order: 5,  colour: '#7ed321', tag: 'design'          },
            { project_id: 1001, task_name: 'Database Schema Design',         description: 'Design relational schema for students, projects, tasks and dependencies', start_date: '2025-10-27', end_date: '2025-11-07', duration: 11, progress_percentage: 100, is_milestone: 0, parent_task_id: 5,    display_order: 6,  colour: '#7ed321', tag: 'design'          },
            { project_id: 1001, task_name: 'UI/UX Mockups',                  description: 'Figma wireframes and interactive prototypes for all key screens',        start_date: '2025-11-03', end_date: '2025-11-21', duration: 18, progress_percentage: 100, is_milestone: 0, parent_task_id: 5,    display_order: 7,  colour: '#7ed321', tag: 'design'          },
            { project_id: 1001, task_name: 'Design Sign-off',                description: 'Supervisor review and approval of architecture and UI designs',           start_date: '2025-11-21', end_date: '2025-11-21', duration: 0,  progress_percentage: 100, is_milestone: 1, parent_task_id: null, display_order: 8,  colour: '#7ed321', tag: 'design'          },
            { project_id: 1001, task_name: 'Development Setup',              description: 'Configure Node.js/Express server, SQLite database and project scaffold',  start_date: '2025-11-24', end_date: '2025-11-28', duration: 4,  progress_percentage: 100, is_milestone: 0, parent_task_id: null, display_order: 9,  colour: '#9013fe', tag: 'implementation'  },
            { project_id: 1001, task_name: 'Backend API Development',        description: 'REST API endpoints for authentication, projects, tasks and dependencies', start_date: '2025-12-01', end_date: '2026-01-09', duration: 39, progress_percentage: 100, is_milestone: 0, parent_task_id: null, display_order: 10, colour: '#9013fe', tag: 'implementation'  },
            { project_id: 1001, task_name: 'Frontend Development',           description: 'Login system, dashboard, project pages and task management UI',          start_date: '2025-12-15', end_date: '2026-01-30', duration: 46, progress_percentage: 100, is_milestone: 0, parent_task_id: null, display_order: 11, colour: '#9013fe', tag: 'implementation'  },
            { project_id: 1001, task_name: 'Gantt Chart Visualisation Engine', description: 'D3.js interactive Gantt chart with zoom, drag, dependencies and export', start_date: '2026-01-12', end_date: '2026-02-06', duration: 25, progress_percentage: 100, is_milestone: 0, parent_task_id: null, display_order: 12, colour: '#9013fe', tag: 'implementation'  },
            { project_id: 1001, task_name: 'System Integration',             description: 'Connect frontend, backend and Gantt chart module end-to-end',             start_date: '2026-02-09', end_date: '2026-02-20', duration: 11, progress_percentage: 100, is_milestone: 0, parent_task_id: null, display_order: 13, colour: '#9013fe', tag: 'implementation'  },
            { project_id: 1001, task_name: 'System Testing & Bug Fixes',     description: 'Functional, usability and edge-case testing with iterative bug fixing',  start_date: '2026-02-23', end_date: '2026-03-13', duration: 18, progress_percentage: 20,  is_milestone: 0, parent_task_id: null, display_order: 14, colour: '#d0021b', tag: 'testing'         },
            { project_id: 1001, task_name: 'User Study & Evaluation',        description: 'Structured user study sessions with students and supervisors, data analysis', start_date: '2026-03-02', end_date: '2026-03-20', duration: 18, progress_percentage: 0,   is_milestone: 0, parent_task_id: null, display_order: 15, colour: '#e67e22', tag: 'evaluation'      },
            { project_id: 1001, task_name: 'Dissertation Writing',           description: 'Full dissertation draft, supervisor feedback rounds and final revision',  start_date: '2026-02-23', end_date: '2026-04-10', duration: 46, progress_percentage: 5,   is_milestone: 0, parent_task_id: null, display_order: 16, colour: '#50e3c2', tag: 'writing'         },
            { project_id: 1001, task_name: 'Final Submission',               description: 'Dissertation and project artefacts submitted via MACS portal',           start_date: '2026-04-11', end_date: '2026-04-11', duration: 0,  progress_percentage: 0,   is_milestone: 1, parent_task_id: null, display_order: 17, colour: '#50e3c2', tag: 'writing'         },

            // ─── Project 1000 tasks (dissertation Gantt chart) ────────────────────────
            { project_id: 1000, task_name: 'Project Allocations Completed',                   description: null, start_date: '2025-09-19', end_date: '2025-09-19', duration: 0,  progress_percentage: 100, is_milestone: 1, parent_task_id: null, display_order: 1,  colour: '#17a2b8', tag: 'Planning'        },
            { project_id: 1000, task_name: 'Initial Supervisor Meeting',                      description: null, start_date: '2025-09-22', end_date: '2025-09-22', duration: 0,  progress_percentage: 100, is_milestone: 0, parent_task_id: null, display_order: 2,  colour: '#17a2b8', tag: 'Planning'        },
            { project_id: 1000, task_name: 'Literature Search & Reading',                     description: null, start_date: '2025-09-25', end_date: '2025-10-09', duration: 14, progress_percentage: 100, is_milestone: 0, parent_task_id: null, display_order: 3,  colour: '#4a90d9', tag: 'Research'        },
            { project_id: 1000, task_name: 'Refine Research Questions',                       description: null, start_date: '2025-10-02', end_date: '2025-10-09', duration: 7,  progress_percentage: 100, is_milestone: 0, parent_task_id: null, display_order: 4,  colour: '#4a90d9', tag: 'Research'        },
            { project_id: 1000, task_name: 'Draft Ethics Application',                        description: null, start_date: '2025-10-10', end_date: '2025-10-20', duration: 10, progress_percentage: 100, is_milestone: 0, parent_task_id: null, display_order: 5,  colour: '#17a2b8', tag: 'Planning'        },
            { project_id: 1000, task_name: 'Review Ethics with Supervisor',                   description: null, start_date: '2025-10-20', end_date: '2025-10-23', duration: 3,  progress_percentage: 100, is_milestone: 0, parent_task_id: null, display_order: 6,  colour: '#17a2b8', tag: 'Planning'        },
            { project_id: 1000, task_name: 'Ethics Submission Deadline',                      description: null, start_date: '2025-10-24', end_date: '2025-10-24', duration: 0,  progress_percentage: 100, is_milestone: 1, parent_task_id: null, display_order: 7,  colour: '#17a2b8', tag: 'Planning'        },
            { project_id: 1000, task_name: 'Draft Introduction (D1)',                         description: null, start_date: '2025-10-27', end_date: '2025-11-06', duration: 10, progress_percentage: 100, is_milestone: 0, parent_task_id: null, display_order: 8,  colour: '#50e3c2', tag: 'Writing'         },
            { project_id: 1000, task_name: 'Draft Literature Review (D2)',                    description: null, start_date: '2025-10-30', end_date: '2025-11-13', duration: 14, progress_percentage: 100, is_milestone: 0, parent_task_id: null, display_order: 9,  colour: '#50e3c2', tag: 'Writing'         },
            { project_id: 1000, task_name: 'Define Methodology & Tools',                      description: null, start_date: '2025-11-03', end_date: '2025-11-10', duration: 7,  progress_percentage: 100, is_milestone: 0, parent_task_id: null, display_order: 10, colour: '#17a2b8', tag: 'Planning'        },
            { project_id: 1000, task_name: 'Review Drafts with Supervisor',                   description: null, start_date: '2025-11-14', end_date: '2025-11-19', duration: 5,  progress_percentage: 100, is_milestone: 0, parent_task_id: null, display_order: 11, colour: '#50e3c2', tag: 'Writing'         },
            { project_id: 1000, task_name: 'Final Polish D1 & D2',                            description: null, start_date: '2025-11-17', end_date: '2025-11-20', duration: 3,  progress_percentage: 100, is_milestone: 0, parent_task_id: null, display_order: 12, colour: '#50e3c2', tag: 'Writing'         },
            { project_id: 1000, task_name: 'First Deliverables (D1 & D2) Due',                description: null, start_date: '2025-11-20', end_date: '2025-11-20', duration: 0,  progress_percentage: 100, is_milestone: 1, parent_task_id: null, display_order: 13, colour: '#50e3c2', tag: 'Writing'         },
            { project_id: 1000, task_name: 'Setup Dev Environment',                           description: null, start_date: '2025-11-21', end_date: '2025-11-28', duration: 7,  progress_percentage: 100, is_milestone: 0, parent_task_id: null, display_order: 14, colour: '#9013fe', tag: 'Implementation'  },
            { project_id: 1000, task_name: 'Core Implementation Sprint 1',                    description: null, start_date: '2025-11-28', end_date: '2025-12-19', duration: 21, progress_percentage: 100, is_milestone: 0, parent_task_id: null, display_order: 15, colour: '#9013fe', tag: 'Implementation'  },
            { project_id: 1000, task_name: 'Marks & Feedback Released',                       description: null, start_date: '2025-12-19', end_date: '2025-12-19', duration: 0,  progress_percentage: 100, is_milestone: 1, parent_task_id: null, display_order: 16, colour: '#e67e22', tag: 'Evaluation'      },
            { project_id: 1000, task_name: 'Review D1/D2 Feedback',                           description: null, start_date: '2026-01-05', end_date: '2026-01-09', duration: 4,  progress_percentage: 100, is_milestone: 0, parent_task_id: null, display_order: 17, colour: '#e67e22', tag: 'Evaluation'      },
            { project_id: 1000, task_name: 'Adjust Plan based on Feedback',                   description: null, start_date: '2026-01-08', end_date: '2026-01-12', duration: 4,  progress_percentage: 100, is_milestone: 0, parent_task_id: null, display_order: 18, colour: '#17a2b8', tag: 'Planning'        },
            { project_id: 1000, task_name: 'Deep Implementation/Coding',                      description: null, start_date: '2026-01-10', end_date: '2026-02-20', duration: 41, progress_percentage: 100, is_milestone: 0, parent_task_id: null, display_order: 19, colour: '#9013fe', tag: 'Implementation'  },
            { project_id: 1000, task_name: 'Login System Implementation',                     description: null, start_date: '2026-01-19', end_date: '2026-01-26', duration: 7,  progress_percentage: 100, is_milestone: 0, parent_task_id: null, display_order: 20, colour: '#9013fe', tag: 'Implementation'  },
            { project_id: 1000, task_name: 'Gantt Chart Page & Dependencies',                 description: null, start_date: '2026-01-26', end_date: '2026-02-03', duration: 8,  progress_percentage: 100, is_milestone: 0, parent_task_id: null, display_order: 21, colour: '#9013fe', tag: 'Implementation'  },
            { project_id: 1000, task_name: 'Progress Bar & Core Features',                    description: null, start_date: '2026-02-03', end_date: '2026-02-10', duration: 7,  progress_percentage: 100, is_milestone: 0, parent_task_id: null, display_order: 22, colour: '#9013fe', tag: 'Implementation'  },
            { project_id: 1000, task_name: 'Export Button & Styling',                         description: null, start_date: '2026-02-10', end_date: '2026-02-17', duration: 7,  progress_percentage: 100, is_milestone: 0, parent_task_id: null, display_order: 23, colour: '#9013fe', tag: 'Implementation'  },
            { project_id: 1000, task_name: 'Additional Features: Tags, Subtasks, Slidable Tasks', description: null, start_date: '2026-02-17', end_date: '2026-02-24', duration: 7,  progress_percentage: 100, is_milestone: 0, parent_task_id: null, display_order: 24, colour: '#9013fe', tag: 'Implementation'  },
            { project_id: 1000, task_name: 'Data Collection/Usability Testing',               description: null, start_date: '2026-02-10', end_date: '2026-02-25', duration: 15, progress_percentage: 100, is_milestone: 0, parent_task_id: null, display_order: 25, colour: '#d0021b', tag: 'Testing'         },
            { project_id: 1000, task_name: 'Tutorial, Supervisor Mode & Comment System',      description: null, start_date: '2026-03-02', end_date: '2026-03-03', duration: 1,  progress_percentage: 100, is_milestone: 0, parent_task_id: null, display_order: 26, colour: '#9013fe', tag: 'Implementation'  },
            { project_id: 1000, task_name: 'Bug Fixes & User Charts',                         description: null, start_date: '2026-03-03', end_date: '2026-03-24', duration: 21, progress_percentage: 100, is_milestone: 0, parent_task_id: null, display_order: 27, colour: '#d0021b', tag: 'Testing'         },
            { project_id: 1000, task_name: 'Analyse Results',                                 description: null, start_date: '2026-02-20', end_date: '2026-03-01', duration: 9,  progress_percentage: 100, is_milestone: 0, parent_task_id: null, display_order: 28, colour: '#e67e22', tag: 'Evaluation'      },
            { project_id: 1000, task_name: 'Draft Results Chapter',                           description: null, start_date: '2026-03-01', end_date: '2026-03-10', duration: 9,  progress_percentage: 100, is_milestone: 0, parent_task_id: null, display_order: 29, colour: '#50e3c2', tag: 'Writing'         },
            { project_id: 1000, task_name: 'Implementation Write-up',                         description: null, start_date: '2026-03-16', end_date: '2026-03-19', duration: 3,  progress_percentage: 100, is_milestone: 0, parent_task_id: null, display_order: 30, colour: '#50e3c2', tag: 'Writing'         },
            { project_id: 1000, task_name: 'Draft Discussion/Evaluation',                     description: null, start_date: '2026-03-11', end_date: '2026-03-20', duration: 9,  progress_percentage: 100, is_milestone: 0, parent_task_id: null, display_order: 31, colour: '#50e3c2', tag: 'Writing'         },
            { project_id: 1000, task_name: 'Final Writing: Abstract & Conclusion',            description: null, start_date: '2026-03-20', end_date: '2026-03-25', duration: 5,  progress_percentage: 100, is_milestone: 0, parent_task_id: null, display_order: 32, colour: '#50e3c2', tag: 'Writing'         },
            { project_id: 1000, task_name: 'Final Proofreading',                              description: null, start_date: '2026-03-24', end_date: '2026-03-26', duration: 2,  progress_percentage: 100, is_milestone: 0, parent_task_id: null, display_order: 33, colour: '#50e3c2', tag: 'Writing'         },
            { project_id: 1000, task_name: 'Final Deliverables (D3) Due',                     description: null, start_date: '2026-03-26', end_date: '2026-03-26', duration: 0,  progress_percentage: 100, is_milestone: 1, parent_task_id: null, display_order: 34, colour: '#50e3c2', tag: 'Writing'         },
            { project_id: 1000, task_name: 'First Draft Submitted to Supervisor',             description: null, start_date: '2026-03-29', end_date: '2026-03-29', duration: 0,  progress_percentage: 100, is_milestone: 1, parent_task_id: null, display_order: 35, colour: '#50e3c2', tag: 'Writing'         },
            { project_id: 1000, task_name: 'Prepare Presentation Slides',                     description: null, start_date: '2026-03-28', end_date: '2026-04-07', duration: 10, progress_percentage: 100, is_milestone: 0, parent_task_id: null, display_order: 36, colour: '#7ed321', tag: 'Design'          },
            { project_id: 1000, task_name: 'Mock/Presentation Practice',                      description: null, start_date: '2026-04-03', end_date: '2026-04-08', duration: 5,  progress_percentage: 100, is_milestone: 0, parent_task_id: null, display_order: 37, colour: '#17a2b8', tag: 'Planning'        },
            { project_id: 1000, task_name: 'Q&A Session (D5)',                                description: null, start_date: '2026-04-09', end_date: '2026-04-09', duration: 0,  progress_percentage: 100, is_milestone: 1, parent_task_id: null, display_order: 38, colour: '#e67e22', tag: 'Evaluation'      },
            { project_id: 1000, task_name: 'Final Marks Released',                            description: null, start_date: '2026-04-17', end_date: '2026-04-17', duration: 0,  progress_percentage: 100, is_milestone: 1, parent_task_id: null, display_order: 39, colour: '#e67e22', tag: 'Evaluation'      }
        ];

        const insertTaskStmt = db.prepare(`
            INSERT INTO tasks (project_id, task_name, description, start_date, end_date, duration, progress_percentage, is_milestone, parent_task_id, display_order, colour, tag)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        sampleTasks.forEach(task => {
            insertTaskStmt.run(
                task.project_id,
                task.task_name,
                task.description,
                task.start_date,
                task.end_date,
                task.duration,
                task.progress_percentage,
                task.is_milestone,
                task.parent_task_id,
                task.display_order,
                task.colour,
                task.tag || null
            );
        });

        insertTaskStmt.finalize();

        const sampleDependencies = [
            // Kickoff unlocks both Literature Review and Requirements Gathering
            { predecessor_task_id: 1,  successor_task_id: 2,  dependency_type: 'finish-to-start' },
            { predecessor_task_id: 1,  successor_task_id: 3,  dependency_type: 'finish-to-start' },
            // Requirements Gathering → Requirements Complete milestone
            { predecessor_task_id: 3,  successor_task_id: 4,  dependency_type: 'finish-to-start' },
            // Requirements Complete → System Architecture Design
            { predecessor_task_id: 4,  successor_task_id: 5,  dependency_type: 'finish-to-start' },
            // Within design: Database Schema → UI/UX Mockups (UI can start once schema is agreed)
            { predecessor_task_id: 6,  successor_task_id: 7,  dependency_type: 'finish-to-start' },
            // UI/UX Mockups complete → Design Sign-off milestone
            { predecessor_task_id: 7,  successor_task_id: 8,  dependency_type: 'finish-to-start' },
            // Design Sign-off → Development Setup
            { predecessor_task_id: 8,  successor_task_id: 9,  dependency_type: 'finish-to-start' },
            // Setup → Backend API Development
            { predecessor_task_id: 9,  successor_task_id: 10, dependency_type: 'finish-to-start' },
            // Frontend starts once Backend is underway (start-to-start overlap, 2-week lag built into dates)
            { predecessor_task_id: 10, successor_task_id: 11, dependency_type: 'start-to-start' },
            // Gantt Visualisation Engine needs Backend API ready
            { predecessor_task_id: 10, successor_task_id: 12, dependency_type: 'finish-to-start' },
            // Integration needs both Frontend and Gantt Engine complete
            { predecessor_task_id: 11, successor_task_id: 13, dependency_type: 'finish-to-start' },
            { predecessor_task_id: 12, successor_task_id: 13, dependency_type: 'finish-to-start' },
            // Testing follows Integration
            { predecessor_task_id: 13, successor_task_id: 14, dependency_type: 'finish-to-start' },
            // User Study overlaps with later Testing (start-to-start)
            { predecessor_task_id: 14, successor_task_id: 15, dependency_type: 'start-to-start' },
            // All three must finish before Final Submission
            { predecessor_task_id: 14, successor_task_id: 17, dependency_type: 'finish-to-start' },
            { predecessor_task_id: 15, successor_task_id: 17, dependency_type: 'finish-to-start' },
            { predecessor_task_id: 16, successor_task_id: 17, dependency_type: 'finish-to-start' }
        ];


        const insertDepStmt = db.prepare(`
            INSERT INTO dependencies (predecessor_task_id, successor_task_id, dependency_type)
            VALUES (?, ?, ?)
        `);

        sampleDependencies.forEach(dep => {
            insertDepStmt.run(dep.predecessor_task_id, dep.successor_task_id, dep.dependency_type);
        });

        insertDepStmt.finalize();

        // Sample comments for project 1001 — supervisor/student exchange
        const sampleComments = [
            {
                id: 1, project_id: 1001, parent_comment_id: null,
                author_email: 'supervisor@hw.ac.uk', author_name: 'Dr Pierre Le Bras', author_role: 'supervisor',
                content: 'Good progress overall on the backend and frontend development phases. The REST API endpoints look well-structured. Before the user study phase, please make sure all endpoints have consistent error handling and input validation — this will be important for robustness during the evaluation.',
                created_at: "datetime('now', '-35 days')"
            },
            {
                id: 2, project_id: 1001, parent_comment_id: 1,
                author_email: 'fd2010@hw.ac.uk', author_name: 'Fraser Davies', author_role: 'student',
                content: 'Thanks Dr Le Bras! I\'ve already added validation on the task date inputs and dependency cycle detection. I\'ll make sure all error responses follow the same JSON format before the user study in March.',
                created_at: "datetime('now', '-34 days')"
            },
            {
                id: 3, project_id: 1001, parent_comment_id: null,
                author_email: 'supervisor@hw.ac.uk', author_name: 'Dr Pierre Le Bras', author_role: 'supervisor',
                content: 'The Gantt chart visualisation is looking very impressive — the D3.js drag-and-drop interaction feels smooth and the dependency lines are clear. One suggestion: consider adding a way to export just the task list as a table (CSV or PDF) alongside the chart export, as some users may prefer tabular data.',
                created_at: "datetime('now', '-21 days')"
            },
            {
                id: 4, project_id: 1001, parent_comment_id: null,
                author_email: 'fd2010@hw.ac.uk', author_name: 'Fraser Davies', author_role: 'student',
                content: 'Quick update: the system testing phase is taking a bit longer than planned due to some edge cases with the subtask date clamping and dependency validation when tasks are moved. I\'ve set progress to 20%. Expecting to wrap up by mid-March before the user study starts.',
                created_at: "datetime('now', '-7 days')"
            },
            {
                id: 5, project_id: 1001, parent_comment_id: 4,
                author_email: 'supervisor@hw.ac.uk', author_name: 'Dr Pierre Le Bras', author_role: 'supervisor',
                content: 'Thanks for the update. Quality is more important than sticking rigidly to the schedule — better to get the edge cases right now than to discover them during the user study. Keep me posted.',
                created_at: "datetime('now', '-6 days')"
            }
        ];

        sampleComments.forEach(c => {
            db.run(
                `INSERT INTO comments (comment_id, project_id, parent_comment_id, author_email, author_name, author_role, content, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ${c.created_at})`,
                [c.id, c.project_id, c.parent_comment_id, c.author_email, c.author_name, c.author_role, c.content]
            );
        });

        console.log('Le Database is setup!!!!!!!!');
        console.log(`Database file location: ${dbPath}`);
        console.log('\nStudents:');

        db.all('SELECT * FROM students', [], (err, rows) => {
            if (err) {
                console.error(err);
                return;
            }
            console.table(rows);

            console.log('\nStudent Projects:');
            db.all(`
                SELECT s.name, s.email, sp.project_id, sp.project_name
                FROM student_projects sp
                JOIN students s ON sp.student_id = s.student_id
                ORDER BY s.name, sp.project_id
            `, [], (err, projectRows) => {
                if (err) {
                    console.error(err);
                    return;
                }
                console.table(projectRows);

                console.log('\nTasks:');
                db.all(`
                    SELECT task_id, project_id, task_name, start_date, end_date, duration, progress_percentage, is_milestone, parent_task_id, display_order, colour
                    FROM tasks
                    ORDER BY project_id, display_order
                `, [], (err, taskRows) => {
                    if (err) {
                        console.error(err);
                        return;
                    }
                    console.table(taskRows);

                    console.log('\nDependencies:');
                    db.all(`
                        SELECT d.dependency_id,
                               t1.task_name AS predecessor,
                               t2.task_name AS successor,
                               d.dependency_type
                        FROM dependencies d
                        JOIN tasks t1 ON d.predecessor_task_id = t1.task_id
                        JOIN tasks t2 ON d.successor_task_id = t2.task_id
                        ORDER BY d.dependency_id
                    `, [], (err, depRows) => {
                        if (err) {
                            console.error(err);
                            return;
                        }
                        console.table(depRows);
                        db.close();
                    });
                });
            });
        });
    });
});
