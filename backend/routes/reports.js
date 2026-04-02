const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const store = require('../data/store');
const { enrichItemsWithMatches } = require('../utils/matchUtils');

router.get('/', auth, async (req, res) => {
    try {
        const existingMatchIds = new Set(store.listChatMatchIdsForUser(req.user._id));
        const rawItems = store.listItemsByUser(req.user._id);
        const myItems = await enrichItemsWithMatches(rawItems, {
            userId: req.user._id,
            existingMatchIds
        });

        res.json({ myItems });
    } catch (_err) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
