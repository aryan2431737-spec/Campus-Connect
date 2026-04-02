const express = require('express');
const auth = require('../middleware/auth');
const store = require('../data/store');

const router = express.Router();

router.get('/', auth, async (req, res) => {
    try {
        const notifications = store.listNotificationsForUser(req.user._id, 10);
        res.json({ notifications });
    } catch (err) {
        console.error('GET /notifications error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

router.put('/read', auth, async (req, res) => {
    try {
        const { matchId, all } = req.body || {};

        if (!all && !matchId) {
            return res.status(400).json({ message: 'matchId or all=true is required' });
        }

        const updated = store.markNotificationsRead({
            userId: req.user._id,
            matchId: matchId ? String(matchId) : null,
            all: Boolean(all)
        });

        res.json({ updated });
    } catch (err) {
        console.error('PUT /notifications/read error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
