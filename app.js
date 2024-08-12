// app.js

const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const app = express();
const port = 3000;

app.set('view engine', 'ejs');
app.use(express.static(__dirname + '/public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({ 
    secret: 'secret',
    resave: true,
    saveUninitialized: true
}));

const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    database: 'chat_app',
    password: '',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

app.get('/', (req, res) => {
    if (req.session.loggedin) {
        res.redirect('/chat');
    } else {
        res.redirect('/login');
    }
});

app.get('/login', (req, res) => {
    res.render('login');
});

app.post('/login', async (req, res) => {
    const username = req.body.username;
    const password = req.body.password;
    const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);

    if (rows.length > 0) {
        const user = rows[0];
        const match = await bcrypt.compare(password, user.password);

        if (match) {
            req.session.loggedin = true;
            req.session.username = username;
            req.session.userId = user.id; 
            await updateUserActivity(user.id, true);
            res.redirect('/chat');
        } else {
            res.send('Incorrect Password');
        }
    } else {
        res.send('User does not exist');
    }
});

app.post('/logout', async (req, res) => {
    const userId = req.session.userId;
    await updateUserActivity(userId, false);

    // Destroy the session
    req.session.destroy((err) => {
        if (err) {
            console.error('Error destroying session:', err);
            res.sendStatus(500); 
        } else {
            res.redirect('/login');
        }
    });
});

async function updateUserActivity(userId, isActive) {
    try {
        const [results] = await pool.query('UPDATE users SET active = ? WHERE id = ?', [isActive, userId]);
        console.log(`User ${userId} activity updated to ${isActive ? 'active' : 'inactive'}`);
    } catch (error) {
        console.error('Error updating user activity:', error);
    }
}

app.get('/register', (req, res) => {
    res.render('register');
});

app.post('/register', async (req, res) => {
    const username = req.body.username;
    const password = await bcrypt.hash(req.body.password, 8);
    const email = req.body.email;
    const age = req.body.age;
    const address = req.body.address;
    
    try {
        await pool.query('INSERT INTO users (username, password, email, age, address) VALUES (?, ?, ?, ?, ?)', [username, password, email, age, address]);
        res.redirect('/login');
    } catch (error) {
        console.error('Error registering user:', error);
        res.sendStatus(500);
    }
});


app.get('/chat', async (req, res) => {
    if (req.session.loggedin) {
        const [users] = await pool.query('SELECT * FROM users');
        let messages = [];
        if (req.session.selectedUser) {
            
            [messages] = await pool.query('SELECT * FROM messages WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?) ORDER BY sent_at', [req.session.userId, req.session.selectedUser, req.session.selectedUser, req.session.userId]);
        }
        res.render('chat', { username: req.session.username, userId: req.session.userId, users, messages, selectedUser: req.session.selectedUser });
    } else {
        res.redirect('/login');
    }
});

app.post('/select-user', (req, res) => {
    const selectedUserId = req.body.selectedUser;
    req.session.selectedUser = selectedUserId;
    res.redirect('/chat');
});

app.post('/send-message', async (req, res) => {
    const senderId = req.session.userId;
    const receiverId = req.body.receiverId;
    const message = req.body.message;
    await pool.query('INSERT INTO messages (sender_id, receiver_id, message) VALUES (?, ?, ?)', [senderId, receiverId, message]);
    res.redirect('/chat');
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
