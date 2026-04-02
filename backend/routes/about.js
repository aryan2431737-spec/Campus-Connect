const express = require('express');
const router  = express.Router();

// GET /api/about
router.get('/', (req, res) => {
    res.json({
        name: 'Campus Connect Lost & Found',
        version: '2.0.0',
        description: 'A platform for college students to report and find lost items.',
        features: ['User Authentication', 'Item Reporting', 'Smart Matching', 'Real-time Chat'],
    });
});

module.exports = router;