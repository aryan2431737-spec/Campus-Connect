const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const store = require('../data/store');
const auth = require('../middleware/auth');

const router = express.Router();

function signToken(userId) {
    return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

router.post('/register', async (req, res) => {
    try {
        const { firstName, lastName, email, password, studentId, contact } = req.body;

        if (!firstName || !lastName || !email || !password || !studentId || !contact) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        if (password.length < 8) {
            return res.status(400).json({ message: 'Password must be at least 8 characters' });
        }

        if (store.getUserByEmail(email)) {
            return res.status(400).json({ message: 'Email already registered' });
        }

        if (store.getUserByStudentId(studentId)) {
            return res.status(400).json({ message: 'Student ID already registered' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const user = store.createUser({
            firstName,
            lastName,
            email,
            passwordHash,
            studentId,
            contact
        });

        const token = signToken(user._id);
        res.status(201).json({ token, user });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ message: 'Server error during registration' });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { email, identifier, password } = req.body;
        const loginValue = String(identifier || email || '').trim();

        if (!loginValue || !password) {
            return res.status(400).json({ message: 'Email or student ID and password are required' });
        }

        const user = store.findUserByLoginValue(loginValue, { includePasswordHash: true });
        if (!user) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        const isMatch = await bcrypt.compare(password, user.passwordHash || '');
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        delete user.passwordHash;
        const token = signToken(user._id);
        res.json({ token, user });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ message: 'Server error during login' });
    }
});

router.get('/me', auth, (req, res) => {
    res.json(req.user);
});

module.exports = router;
