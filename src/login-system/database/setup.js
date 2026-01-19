// Database Setup Script for Gantt Chart Project
// Run ts to create the SQLite database and tables

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'gantt.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    // Create students table
    db.run(`
        CREATE TABLE IF NOT EXISTS students (
            student_id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            project_id INTEGER UNIQUE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Sample data for testing
    const sampleStudents = [
        { email: 'fd2010@hw.ac.uk', name: 'Fraser Davies', project_id: 1001 },
        { email: 'test@hw.ac.uk', name: 'Test Student', project_id: 1002 },
        { email: 'demo@hw.ac.uk', name: 'Demo User', project_id: 1003 },
        { email: 'aa2212@hw.ac.uk', name: 'Aadham Ahmad', project_id: 1004 }
    ];

    const insertStmt = db.prepare(`
        INSERT OR IGNORE INTO students (email, name, project_id) 
        VALUES (?, ?, ?)
    `);

    sampleStudents.forEach(student => {
        insertStmt.run(student.email, student.name, student.project_id);
    });

    insertStmt.finalize();

    console.log('Le Database is setup!!!!!!!!');
    console.log(`Database file location: ${dbPath}`);
    console.log('\nCurrent database:');
    
    db.all('SELECT * FROM students', [], (err, rows) => {
        if (err) {
            console.error(err);
            return;
        }
        console.table(rows);
        db.close();
    });
});
