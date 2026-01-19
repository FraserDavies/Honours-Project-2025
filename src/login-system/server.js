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

// Database connection
const dbPath = path.join(__dirname, 'database', 'gantt.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error connecting to database:', err);
    } else {
        console.log('Connected to SQLite database');
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
        'SELECT student_id, email, name, project_id FROM students WHERE LOWER(email) = ?',
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
                // User found - successful login
                res.json({
                    success: true,
                    message: 'Login successful',
                    user: {
                        student_id: row.student_id,
                        email: row.email,
                        name: row.name,
                        project_id: row.project_id
                    }
                });
            } else {
                // User not found
                res.status(401).json({
                    success: false,
                    message: 'Email not found. Please check your email address.'
                });
            }
        }
    );
});

// Get user info endpoint (for session validation)
app.get('/api/user/:email', (req, res) => {
    const email = req.params.email.toLowerCase().trim();

    db.get(
        'SELECT student_id, email, name, project_id FROM students WHERE LOWER(email) = ?',
        [email],
        (err, row) => {
            if (err) {
                return res.status(500).json({ success: false, message: 'Database error' });
            }
            if (row) {
                res.json({ success: true, user: row });
            } else {
                res.status(404).json({ success: false, message: 'User not found' });
            }
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
