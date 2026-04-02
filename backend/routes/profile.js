const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const store = require('../data/store');
const { createUploader } = require('../middleware/uploadMiddleware');

const avatarUpload = createUploader('avatars');

function withAvatarUpload(req, res, next) {
    avatarUpload.single('avatar')(req, res, (err) => {
        if (!err) return next();
        if (err.name === 'MulterError' && err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ message: 'Image size cannot exceed 5MB' });
        }
        return res.status(err.statusCode || 400).json({ message: err.message || 'Invalid image upload' });
    });
}

function getAvatarURL(req) {
    if (!req.file) return '';
    return `${req.protocol}://${req.get('host')}/uploads/avatars/${req.file.filename}`;
}

router.get('/', auth, async (req, res) => {
    try {
        const user = store.getUserById(req.user._id);
        res.json(user);
    } catch (_err) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.put('/edit', auth, withAvatarUpload, async (req, res) => {
    try {
        const existingUser = store.getUserById(req.user._id);
        if (!existingUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        const updates = {};
        ['firstName', 'lastName', 'contact'].forEach((field) => {
            if (req.body[field] !== undefined) {
                updates[field] = String(req.body[field]).trim();
            }
        });

        if (req.file) {
            updates.avatar = getAvatarURL(req);
        } else if (req.body.avatar !== undefined) {
            updates.avatar = String(req.body.avatar).trim();
        }

        const user = store.updateUser(req.user._id, updates);
        res.json(user);
    } catch (err) {
        res.status(500).json({ message: 'Server error: ' + err.message });
    }
});

module.exports = router;
