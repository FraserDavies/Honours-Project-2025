// Server for Gantt Chart Login System
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
// Serve gantt-builder files
app.use('/gantt-builder', express.static(path.join(__dirname, '..', 'gantt-builder')));

// Database connection
const dbPath = path.join(__dirname, 'database', 'gantt.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error connecting to database:', err);
    } else {
        console.log('Connected to SQLite database');
        // Idempotent migrations - safe to run on an existing DB
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
        // Add project date columns if not already present (SQLite errors on duplicate column)
        db.run(`ALTER TABLE student_projects ADD COLUMN start_date TEXT`, err => {
            if (err && !err.message.includes('duplicate column name')) console.error('Migration error (start_date):', err);
        });
        db.run(`ALTER TABLE student_projects ADD COLUMN end_date TEXT`, err => {
            if (err && !err.message.includes('duplicate column name')) console.error('Migration error (end_date):', err);
        });
        // Supervisor and comments tables (idempotent)
        db.run(`
            CREATE TABLE IF NOT EXISTS supervisors (
                supervisor_id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL
            )
        `);
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
        // Seed test supervisor account (idempotent)
        db.run(`INSERT OR IGNORE INTO supervisors (email, name) VALUES ('supervisor@hw.ac.uk', 'Dr Pierre Le Bras')`);
        db.run(`INSERT OR IGNORE INTO supervisor_projects (supervisor_id, project_id)
                SELECT supervisor_id, 1001 FROM supervisors WHERE email = 'supervisor@hw.ac.uk'`);
        db.run(`INSERT OR IGNORE INTO supervisor_projects (supervisor_id, project_id)
                SELECT supervisor_id, 1004 FROM supervisors WHERE email = 'supervisor@hw.ac.uk'`);
        // Seed sample comments for project 1001 if none exist yet
        db.get(`SELECT COUNT(*) AS cnt FROM comments WHERE project_id = 1001`, [], (err, row) => {
            if (err || (row && row.cnt > 0)) return;
            const comments = [
                [1, 1001, null,  'supervisor@hw.ac.uk', 'Dr Pierre Le Bras', 'supervisor',
                 'Good progress overall on the backend and frontend development phases. The REST API endpoints look well-structured. Before the user study phase, please make sure all endpoints have consistent error handling and input validation - this will be important for robustness during the evaluation.',
                 "datetime('now', '-35 days')"],
                [2, 1001, 1,    'fd2010@hw.ac.uk', 'Fraser Davies', 'student',
                 "Thanks Dr Le Bras! I've already added validation on the task date inputs and dependency cycle detection. I'll make sure all error responses follow the same JSON format before the user study in March.",
                 "datetime('now', '-34 days')"],
                [3, 1001, null,  'supervisor@hw.ac.uk', 'Dr Pierre Le Bras', 'supervisor',
                 'The Gantt chart visualisation is looking very impressive - the D3.js drag-and-drop interaction feels smooth and the dependency lines are clear. One suggestion: consider adding a way to export just the task list as a table (CSV or PDF) alongside the chart export, as some users may prefer tabular data.',
                 "datetime('now', '-21 days')"],
                [4, 1001, null,  'fd2010@hw.ac.uk', 'Fraser Davies', 'student',
                 "Quick update: the system testing phase is taking a bit longer than planned due to some edge cases with the subtask date clamping and dependency validation when tasks are moved. I've set progress to 20%. Expecting to wrap up by mid-March before the user study starts.",
                 "datetime('now', '-7 days')"],
                [5, 1001, 4,    'supervisor@hw.ac.uk', 'Dr Pierre Le Bras', 'supervisor',
                 'Thanks for the update. Quality is more important than sticking rigidly to the schedule - better to get the edge cases right now than to discover them during the user study. Keep me posted.',
                 "datetime('now', '-6 days')"],
            ];
            comments.forEach(([id, proj, parent, email, name, role, content, ts]) => {
                db.run(
                    `INSERT INTO comments (comment_id, project_id, parent_comment_id, author_email, author_name, author_role, content, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ${ts})`,
                    [id, proj, parent, email, name, role, content]
                );
            });
        });
    }
});

// Login endpoint - looks up user by email
app.post('/api/login', (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({
            success: false,
            message: 'Email is required'
        });
    }

    // Normalise email to lowercase
    const normalisedEmail = email.toLowerCase().trim();

    db.get(
        'SELECT student_id, email, name FROM students WHERE LOWER(email) = ?',
        [normalisedEmail],
        (err, row) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({
                    success: false,
                    message: 'Database error'
                });
            }

            if (row) {
                // Student found - get their projects
                db.all(
                    'SELECT project_id, project_name, project_description FROM student_projects WHERE student_id = ? ORDER BY project_id',
                    [row.student_id],
                    (err, projects) => {
                        if (err) {
                            console.error('Database error fetching projects:', err);
                            return res.status(500).json({
                                success: false,
                                message: 'Database error'
                            });
                        }

                        res.json({
                            success: true,
                            message: 'Login successful',
                            user: {
                                student_id: row.student_id,
                                email: row.email,
                                name: row.name,
                                role: 'student',
                                projects: projects || []
                            }
                        });
                    }
                );
            } else {
                // Not a student - check supervisors table
                db.get(
                    'SELECT supervisor_id, email, name FROM supervisors WHERE LOWER(email) = ?',
                    [normalisedEmail],
                    (err, sup) => {
                        if (err) {
                            console.error('Database error:', err);
                            return res.status(500).json({ success: false, message: 'Database error' });
                        }

                        if (sup) {
                            // Supervisor found - get their supervised projects
                            db.all(
                                `SELECT sp.project_id, sp.project_name, sp.project_description
                                 FROM supervisor_projects svp
                                 JOIN student_projects sp ON svp.project_id = sp.project_id
                                 WHERE svp.supervisor_id = ?
                                 ORDER BY sp.project_id`,
                                [sup.supervisor_id],
                                (err, projects) => {
                                    if (err) {
                                        console.error('Database error fetching supervised projects:', err);
                                        return res.status(500).json({ success: false, message: 'Database error' });
                                    }

                                    res.json({
                                        success: true,
                                        message: 'Login successful',
                                        user: {
                                            supervisor_id: sup.supervisor_id,
                                            email: sup.email,
                                            name: sup.name,
                                            role: 'supervisor',
                                            projects: projects || []
                                        }
                                    });
                                }
                            );
                        } else {
                            // Email not found in either table
                            res.status(401).json({
                                success: false,
                                message: 'Email not found. Please check your email address.'
                            });
                        }
                    }
                );
            }
        }
    );
});

// Get user info endpoint
app.get('/api/user/:email', (req, res) => {
    const email = req.params.email.toLowerCase().trim();

    db.get(
        'SELECT student_id, email, name FROM students WHERE LOWER(email) = ?',
        [email],
        (err, row) => {
            if (err) {
                return res.status(500).json({ success: false, message: 'Database error' });
            }
            if (row) {
                // Get user's projects
                db.all(
                    'SELECT project_id, project_name, project_description FROM student_projects WHERE student_id = ? ORDER BY project_id',
                    [row.student_id],
                    (err, projects) => {
                        if (err) {
                            return res.status(500).json({ success: false, message: 'Database error' });
                        }
                        res.json({
                            success: true,
                            user: {
                                student_id: row.student_id,
                                email: row.email,
                                name: row.name,
                                projects: projects || []
                            }
                        });
                    }
                );
            } else {
                res.status(404).json({ success: false, message: 'User not found' });
            }
        }
    );
});

// Create a new project for a student
app.post('/api/projects', (req, res) => {
    const { student_id, project_name, project_description, start_date, end_date } = req.body;

    if (!student_id || !project_name) {
        return res.status(400).json({ success: false, message: 'student_id and project_name are required' });
    }

    // Generate a unique project_id by incrementing the current max
    db.get('SELECT COALESCE(MAX(project_id), 1000) + 1 AS next_id FROM student_projects', [], (err, row) => {
        if (err) return res.status(500).json({ success: false, message: 'Database error' });
        const newProjectId = row.next_id;

        db.run(
            `INSERT INTO student_projects (student_id, project_id, project_name, project_description, start_date, end_date)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [student_id, newProjectId, project_name, project_description || null, start_date || null, end_date || null],
            function(err2) {
                if (err2) {
                    console.error('Error creating project:', err2);
                    return res.status(500).json({ success: false, message: 'Database error' });
                }
                res.json({ success: true, project_id: newProjectId });
            }
        );
    });
});

// Get project details (including boundary dates)
app.get('/api/projects/:projectId', (req, res) => {
    const { projectId } = req.params;
    db.get(
        'SELECT project_id, project_name, project_description, start_date, end_date FROM student_projects WHERE project_id = ?',
        [projectId],
        (err, row) => {
            if (err) return res.status(500).json({ success: false, message: 'Database error' });
            if (!row) return res.status(404).json({ success: false, message: 'Project not found' });
            res.json({ success: true, project: row });
        }
    );
});

// Update project boundary dates
app.patch('/api/projects/:projectId/dates', (req, res) => {
    const { projectId } = req.params;
    const { start_date, end_date } = req.body;

    const updates = [];
    const values = [];
    if (start_date !== undefined) { updates.push('start_date = ?'); values.push(start_date || null); }
    if (end_date   !== undefined) { updates.push('end_date = ?');   values.push(end_date   || null); }

    if (updates.length === 0) {
        return res.status(400).json({ success: false, message: 'start_date or end_date required' });
    }
    values.push(projectId);

    db.run(`UPDATE student_projects SET ${updates.join(', ')} WHERE project_id = ?`, values, function(err) {
        if (err) return res.status(500).json({ success: false, message: 'Database error' });
        if (this.changes === 0) return res.status(404).json({ success: false, message: 'Project not found' });
        res.json({ success: true });
    });
});

// Get tasks for a project
app.get('/api/projects/:projectId/tasks', (req, res) => {
    const projectId = req.params.projectId;

    db.all(
        `SELECT task_id, project_id, task_name, description, start_date, end_date, duration,
                progress_percentage, is_milestone, parent_task_id, display_order, colour, tag
         FROM tasks
         WHERE project_id = ?
         ORDER BY display_order`,
        [projectId],
        (err, tasks) => {
            if (err) {
                console.error('Database error fetching tasks:', err);
                return res.status(500).json({ success: false, message: 'Database error' });
            }
            res.json({ success: true, tasks: tasks || [] });
        }
    );
});

// Get dependencies for a project's tasks
app.get('/api/projects/:projectId/dependencies', (req, res) => {
    const projectId = req.params.projectId;

    db.all(
        `SELECT d.dependency_id, d.predecessor_task_id, d.successor_task_id, d.dependency_type
         FROM dependencies d
         JOIN tasks t ON d.predecessor_task_id = t.task_id
         WHERE t.project_id = ?
         ORDER BY d.dependency_id`,
        [projectId],
        (err, dependencies) => {
            if (err) {
                console.error('Database error fetching dependencies:', err);
                return res.status(500).json({ success: false, message: 'Database error' });
            }
            res.json({ success: true, dependencies: dependencies || [] });
        }
    );
});

// Update a task (name, dates, progress)
app.patch('/api/tasks/:taskId', (req, res) => {
    const { taskId } = req.params;
    const { task_name, start_date, end_date, progress_percentage } = req.body;

    const updates = [];
    const values = [];

    if (task_name           !== undefined) { updates.push('task_name = ?');            values.push(task_name); }
    if (start_date          !== undefined) { updates.push('start_date = ?');           values.push(start_date); }
    if (end_date            !== undefined) { updates.push('end_date = ?');             values.push(end_date); }
    if (progress_percentage !== undefined) { updates.push('progress_percentage = ?');  values.push(progress_percentage); }

    if (updates.length === 0) {
        return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    // If dates are changing, validate against project bounds before running the UPDATE
    if (start_date !== undefined || end_date !== undefined) {
        db.get(
            `SELECT t.start_date AS cur_start, t.end_date AS cur_end,
                    sp.start_date AS proj_start, sp.end_date AS proj_end
             FROM tasks t
             LEFT JOIN student_projects sp ON t.project_id = sp.project_id
             WHERE t.task_id = ?`,
            [taskId],
            (err, row) => {
                if (err) return res.status(500).json({ success: false, message: 'Database error' });
                if (!row) return res.status(404).json({ success: false, message: 'Task not found' });

                const newStart = start_date || row.cur_start;
                const newEnd   = end_date   || row.cur_end;

                if (row.proj_start && newStart < row.proj_start) {
                    return res.status(400).json({ success: false, message: `Task start (${newStart}) is before project start (${row.proj_start})` });
                }
                if (row.proj_end && newEnd > row.proj_end) {
                    return res.status(400).json({ success: false, message: `Task end (${newEnd}) is after project deadline (${row.proj_end})` });
                }

                runUpdate();
            }
        );
    } else {
        runUpdate();
    }

    function runUpdate() {
        const vals = [...values, taskId];
        db.run(
            `UPDATE tasks SET ${updates.join(', ')} WHERE task_id = ?`,
            vals,
            function(err) {
                if (err) {
                    console.error('Error updating task:', err);
                    return res.status(500).json({ success: false, message: 'Database error' });
                }
                if (this.changes === 0) {
                    return res.status(404).json({ success: false, message: 'Task not found' });
                }

                // If dates changed, clamp any existing subtask dates to stay within parent bounds
                if (start_date !== undefined || end_date !== undefined) {
                    db.get('SELECT start_date, end_date FROM tasks WHERE task_id = ?', [taskId], (err2, task) => {
                        if (err2 || !task) { return res.json({ success: true }); }
                        const newStart = task.start_date;
                        const newEnd   = task.end_date;
                        db.run(`UPDATE subtasks SET start_date = ? WHERE parent_task_id = ? AND start_date < ?`,
                            [newStart, taskId, newStart], () => {
                            db.run(`UPDATE subtasks SET end_date = ? WHERE parent_task_id = ? AND end_date > ?`,
                                [newEnd, taskId, newEnd], () => {
                                res.json({ success: true, subtasksClamped: true });
                            });
                        });
                    });
                } else {
                    res.json({ success: true });
                }
            }
        );
    }
});

// Delete a task (and its dependencies)
app.delete('/api/tasks/:taskId', (req, res) => {
    const { taskId } = req.params;

    db.run(
        'DELETE FROM dependencies WHERE predecessor_task_id = ? OR successor_task_id = ?',
        [taskId, taskId],
        (err) => {
            if (err) {
                return res.status(500).json({ success: false, message: 'Database error' });
            }
            db.run('DELETE FROM tasks WHERE task_id = ?', [taskId], function(err) {
                if (err) {
                    return res.status(500).json({ success: false, message: 'Database error' });
                }
                if (this.changes === 0) {
                    return res.status(404).json({ success: false, message: 'Task not found' });
                }
                res.json({ success: true });
            });
        }
    );
});

// Create a new task
app.post('/api/projects/:projectId/tasks', (req, res) => {
    const { projectId } = req.params;
    const { task_name, start_date, end_date, is_milestone, tag, colour } = req.body;

    if (!task_name || !start_date || !end_date) {
        return res.status(400).json({ success: false, message: 'task_name, start_date, and end_date are required' });
    }

    db.get(
        'SELECT COALESCE(MAX(display_order), 0) + 1 AS next_order FROM tasks WHERE project_id = ?',
        [projectId],
        (err, row) => {
            if (err) return res.status(500).json({ success: false, message: 'Database error' });
            const displayOrder = row.next_order;

            // Validate dates against project bounds if set
            db.get('SELECT start_date, end_date FROM student_projects WHERE project_id = ?', [projectId], (err2, project) => {
                if (err2) return res.status(500).json({ success: false, message: 'Database error' });

                if (project) {
                    if (project.start_date && start_date < project.start_date) {
                        return res.status(400).json({ success: false, message: `Task start (${start_date}) is before project start (${project.start_date})` });
                    }
                    if (project.end_date && end_date > project.end_date) {
                        return res.status(400).json({ success: false, message: `Task end (${end_date}) is after project deadline (${project.end_date})` });
                    }
                }

                db.run(
                    `INSERT INTO tasks (project_id, task_name, start_date, end_date, progress_percentage, is_milestone, tag, colour, display_order)
                     VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)`,
                    [projectId, task_name, start_date, end_date, is_milestone ? 1 : 0, tag || null, colour || null, displayOrder],
                    function(err3) {
                        if (err3) {
                            console.error('Error creating task:', err3);
                            return res.status(500).json({ success: false, message: 'Database error' });
                        }
                        res.json({ success: true, task_id: this.lastID });
                    }
                );
            });
        }
    );
});

// Delete a dependency by ID
app.delete('/api/dependencies/:dependencyId', (req, res) => {
    const { dependencyId } = req.params;

    db.run('DELETE FROM dependencies WHERE dependency_id = ?', [dependencyId], function(err) {
        if (err) {
            console.error('Error deleting dependency:', err);
            return res.status(500).json({ success: false, message: 'Database error' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ success: false, message: 'Dependency not found' });
        }
        res.json({ success: true });
    });
});

// Create a new dependency between two tasks
app.post('/api/projects/:projectId/dependencies', (req, res) => {
    const { predecessor_task_id, successor_task_id, dependency_type } = req.body;

    if (!predecessor_task_id || !successor_task_id) {
        return res.status(400).json({ success: false, message: 'predecessor_task_id and successor_task_id are required' });
    }

    const type = dependency_type || 'finish-to-start';

    // Check for duplicate first
    db.get(
        'SELECT dependency_id FROM dependencies WHERE predecessor_task_id = ? AND successor_task_id = ?',
        [predecessor_task_id, successor_task_id],
        (err, existing) => {
            if (err) return res.status(500).json({ success: false, message: 'Database error' });
            if (existing) return res.json({ success: true, dependency_id: existing.dependency_id, duplicate: true });

            db.run(
                'INSERT INTO dependencies (predecessor_task_id, successor_task_id, dependency_type) VALUES (?, ?, ?)',
                [predecessor_task_id, successor_task_id, type],
                function(err) {
                    if (err) {
                        console.error('Error creating dependency:', err);
                        return res.status(500).json({ success: false, message: 'Database error' });
                    }
                    res.json({ success: true, dependency_id: this.lastID });
                }
            );
        }
    );
});

// =============== SUBTASK ROUTES ===============

// Get all subtasks for a project
app.get('/api/projects/:projectId/subtasks', (req, res) => {
    const { projectId } = req.params;
    db.all(
        `SELECT s.subtask_id, s.parent_task_id, s.subtask_name, s.progress_percentage,
                s.start_date, s.end_date, s.display_order
         FROM subtasks s
         JOIN tasks t ON s.parent_task_id = t.task_id
         WHERE t.project_id = ?
         ORDER BY s.parent_task_id, s.display_order`,
        [projectId],
        (err, rows) => {
            if (err) {
                console.error('Error fetching subtasks:', err);
                return res.status(500).json({ success: false, message: 'Database error' });
            }
            res.json({ success: true, subtasks: rows || [] });
        }
    );
});

// Create a subtask under a task
app.post('/api/tasks/:taskId/subtasks', (req, res) => {
    const { taskId } = req.params;
    const { subtask_name, start_date, end_date } = req.body;

    if (!subtask_name || !start_date || !end_date) {
        return res.status(400).json({ success: false, message: 'subtask_name, start_date, and end_date are required' });
    }

    // Validate dates fall within parent bounds
    db.get('SELECT start_date, end_date FROM tasks WHERE task_id = ?', [taskId], (err, task) => {
        if (err) return res.status(500).json({ success: false, message: 'Database error' });
        if (!task) return res.status(404).json({ success: false, message: 'Parent task not found' });

        if (start_date < task.start_date || end_date > task.end_date) {
            return res.status(400).json({ success: false, message: 'Subtask dates must fall within parent task bounds' });
        }

        db.get('SELECT COALESCE(MAX(display_order), 0) + 1 AS next_order FROM subtasks WHERE parent_task_id = ?',
            [taskId], (err2, row) => {
            if (err2) return res.status(500).json({ success: false, message: 'Database error' });
            const displayOrder = row.next_order;
            db.run(
                `INSERT INTO subtasks (parent_task_id, subtask_name, progress_percentage, start_date, end_date, display_order)
                 VALUES (?, ?, 0, ?, ?, ?)`,
                [taskId, subtask_name, start_date, end_date, displayOrder],
                function(err3) {
                    if (err3) {
                        console.error('Error creating subtask:', err3);
                        return res.status(500).json({ success: false, message: 'Database error' });
                    }
                    res.json({ success: true, subtask_id: this.lastID });
                }
            );
        });
    });
});

// Update a subtask (name, progress, dates)
app.patch('/api/subtasks/:subtaskId', (req, res) => {
    const { subtaskId } = req.params;
    const { subtask_name, progress_percentage, start_date, end_date } = req.body;

    const updates = [];
    const values = [];

    if (subtask_name        !== undefined) { updates.push('subtask_name = ?');        values.push(subtask_name); }
    if (progress_percentage !== undefined) { updates.push('progress_percentage = ?'); values.push(progress_percentage); }
    if (start_date          !== undefined) { updates.push('start_date = ?');          values.push(start_date); }
    if (end_date            !== undefined) { updates.push('end_date = ?');            values.push(end_date); }

    if (updates.length === 0) {
        return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    values.push(subtaskId);
    db.run(
        `UPDATE subtasks SET ${updates.join(', ')} WHERE subtask_id = ?`,
        values,
        function(err) {
            if (err) {
                console.error('Error updating subtask:', err);
                return res.status(500).json({ success: false, message: 'Database error' });
            }
            if (this.changes === 0) {
                return res.status(404).json({ success: false, message: 'Subtask not found' });
            }
            res.json({ success: true });
        }
    );
});

// Delete a subtask
app.delete('/api/subtasks/:subtaskId', (req, res) => {
    const { subtaskId } = req.params;
    db.run('DELETE FROM subtasks WHERE subtask_id = ?', [subtaskId], function(err) {
        if (err) {
            console.error('Error deleting subtask:', err);
            return res.status(500).json({ success: false, message: 'Database error' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ success: false, message: 'Subtask not found' });
        }
        res.json({ success: true });
    });
});

// =============== COMMENT ROUTES ===============

// Get all comments for a project
app.get('/api/projects/:projectId/comments', (req, res) => {
    const { projectId } = req.params;
    db.all(
        `SELECT comment_id, parent_comment_id, author_email, author_name, author_role, content, created_at
         FROM comments
         WHERE project_id = ?
         ORDER BY created_at ASC`,
        [projectId],
        (err, rows) => {
            if (err) {
                console.error('Error fetching comments:', err);
                return res.status(500).json({ success: false, message: 'Database error' });
            }
            res.json({ success: true, comments: rows || [] });
        }
    );
});

// Post a new comment or reply
app.post('/api/projects/:projectId/comments', (req, res) => {
    const { projectId } = req.params;
    const { parent_comment_id, author_email, author_name, author_role, content } = req.body;

    if (!author_email || !author_name || !author_role || !content) {
        return res.status(400).json({ success: false, message: 'author_email, author_name, author_role, and content are required' });
    }

    db.run(
        `INSERT INTO comments (project_id, parent_comment_id, author_email, author_name, author_role, content)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [projectId, parent_comment_id || null, author_email, author_name, author_role, content],
        function(err) {
            if (err) {
                console.error('Error inserting comment:', err);
                return res.status(500).json({ success: false, message: 'Database error' });
            }
            res.json({ success: true, comment_id: this.lastID });
        }
    );
});

// Add a project to a supervisor's supervised list
app.post('/api/supervisors/:supervisorId/projects', (req, res) => {
    const supervisorId = parseInt(req.params.supervisorId);
    const { project_id } = req.body;

    if (!project_id) {
        return res.status(400).json({ success: false, message: 'project_id is required.' });
    }

    db.get(
        'SELECT project_id, project_name, project_description FROM student_projects WHERE project_id = ?',
        [parseInt(project_id)],
        (err, project) => {
            if (err) return res.status(500).json({ success: false, message: 'Database error.' });
            if (!project) return res.status(404).json({ success: false, message: `Project ${project_id} not found.` });

            db.run(
                'INSERT INTO supervisor_projects (supervisor_id, project_id) VALUES (?, ?)',
                [supervisorId, project.project_id],
                function(err) {
                    if (err) {
                        if (err.message.includes('UNIQUE constraint failed')) {
                            return res.status(409).json({ success: false, message: 'You are already supervising this project.' });
                        }
                        return res.status(500).json({ success: false, message: 'Database error.' });
                    }
                    res.json({ success: true, project });
                }
            );
        }
    );
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Serving static files from: ${path.join(__dirname, 'public')}`);
});

// SHUTDOWNNNN
process.on('SIGINT', () => {
    db.close((err) => {
        if (err) {
            console.error(err.message);
        }
        console.log('\nDatabase connection closed.');
        process.exit(0);
    });
});
