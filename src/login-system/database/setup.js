// Database Setup Script for Gantt Chart Project

// Create database connection
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Create db path
const dbPath = path.join(__dirname, 'gantt.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    // Drop existing tables to reset schema (for migration)
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
            FOREIGN KEY (project_id) REFERENCES student_projects(project_id),
            FOREIGN KEY (parent_task_id) REFERENCES tasks(task_id)
        )
    `);

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

    // Sample project assignments (students can have multiple projects)
    const sampleProjectAssignments = [
        { email: 'fd2010@hw.ac.uk', project_id: 1001, project_name: 'Gantt Chart Builder', project_description: 'A web-based tool for creating and managing Gantt charts for project planning' },
        { email: 'fd2010@hw.ac.uk', project_id: 1002, project_name: 'AI Research Tool', project_description: 'Machine learning platform for academic research analysis' },
        { email: 'fd2010@hw.ac.uk', project_id: 1003, project_name: 'Database Manager', project_description: 'SQLite database management and visualization tool' },
        { email: 'test@hw.ac.uk', project_id: 1004, project_name: 'Test Project', project_description: 'A sample project for testing purposes' },
        { email: 'test@hw.ac.uk', project_id: 1005, project_name: 'Another Test', project_description: 'Secondary test project for validation' },
        { email: 'demo@hw.ac.uk', project_id: 1006, project_name: 'Demo Project', project_description: 'Demonstration project showcasing system features' },
        { email: 'aa2212@hw.ac.uk', project_id: 1007, project_name: 'Aadham Project 1', project_description: 'First project assignment for Aadham' },
        { email: 'aa2212@hw.ac.uk', project_id: 1008, project_name: 'Aadham Project 2', project_description: 'Second project assignment for Aadham' }
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
            INSERT OR IGNORE INTO student_projects (student_id, project_id, project_name, project_description)
            VALUES (?, ?, ?, ?)
        `);

        sampleProjectAssignments.forEach(assignment => {
            const studentId = emailToId[assignment.email];
            if (studentId) {
                insertProjectStmt.run(studentId, assignment.project_id, assignment.project_name, assignment.project_description);
            }
        });

        insertProjectStmt.finalize();

        // Sample tasks for Gantt Chart Builder project (project_id: 1001)
        const sampleTasks = [
            { project_id: 1001, task_name: 'Project Planning', description: 'Initial project planning and requirements gathering', start_date: '2025-01-06', end_date: '2025-01-12', duration: 7, progress_percentage: 100, is_milestone: 0, parent_task_id: null, display_order: 1 },
            { project_id: 1001, task_name: 'Requirements Complete', description: 'Requirements documentation finalized', start_date: '2025-01-12', end_date: '2025-01-12', duration: 0, progress_percentage: 100, is_milestone: 1, parent_task_id: null, display_order: 2 },
            { project_id: 1001, task_name: 'Design Phase', description: 'UI/UX design and system architecture', start_date: '2025-01-13', end_date: '2025-01-26', duration: 14, progress_percentage: 75, is_milestone: 0, parent_task_id: null, display_order: 3 },
            { project_id: 1001, task_name: 'Database Design', description: 'Design database schema and relationships', start_date: '2025-01-13', end_date: '2025-01-19', duration: 7, progress_percentage: 100, is_milestone: 0, parent_task_id: 3, display_order: 4 },
            { project_id: 1001, task_name: 'UI Mockups', description: 'Create user interface mockups', start_date: '2025-01-20', end_date: '2025-01-26', duration: 7, progress_percentage: 50, is_milestone: 0, parent_task_id: 3, display_order: 5 },
            { project_id: 1001, task_name: 'Development Phase', description: 'Core development work', start_date: '2025-01-27', end_date: '2025-03-09', duration: 42, progress_percentage: 20, is_milestone: 0, parent_task_id: null, display_order: 6 },
            { project_id: 1001, task_name: 'Backend Implementation', description: 'Server-side development', start_date: '2025-01-27', end_date: '2025-02-16', duration: 21, progress_percentage: 30, is_milestone: 0, parent_task_id: 6, display_order: 7 },
            { project_id: 1001, task_name: 'Frontend Implementation', description: 'Client-side development', start_date: '2025-02-10', end_date: '2025-03-02', duration: 21, progress_percentage: 10, is_milestone: 0, parent_task_id: 6, display_order: 8 },
            { project_id: 1001, task_name: 'Integration', description: 'Integrate frontend and backend', start_date: '2025-03-03', end_date: '2025-03-09', duration: 7, progress_percentage: 0, is_milestone: 0, parent_task_id: 6, display_order: 9 },
            { project_id: 1001, task_name: 'Testing Phase', description: 'Testing and bug fixes', start_date: '2025-03-10', end_date: '2025-03-23', duration: 14, progress_percentage: 0, is_milestone: 0, parent_task_id: null, display_order: 10 },
            { project_id: 1001, task_name: 'Project Delivery', description: 'Final project submission', start_date: '2025-03-24', end_date: '2025-03-24', duration: 0, progress_percentage: 0, is_milestone: 1, parent_task_id: null, display_order: 11 }
        ];

        const insertTaskStmt = db.prepare(`
            INSERT INTO tasks (project_id, task_name, description, start_date, end_date, duration, progress_percentage, is_milestone, parent_task_id, display_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                task.display_order
            );
        });

        insertTaskStmt.finalize();

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
                SELECT s.name, s.email, sp.project_id, sp.project_name, sp.project_description
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
                    SELECT task_id, project_id, task_name, start_date, end_date, duration, progress_percentage, is_milestone, parent_task_id, display_order
                    FROM tasks
                    ORDER BY project_id, display_order
                `, [], (err, taskRows) => {
                    if (err) {
                        console.error(err);
                        return;
                    }
                    console.table(taskRows);
                    db.close();
                });
            });
        });
    });
});
