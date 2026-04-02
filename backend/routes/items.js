const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const fs = require('fs/promises');
const store = require('../data/store');
const auth = require('../middleware/auth');
const upload = require('../middleware/uploadMiddleware');
const { findPotentialMatchesForItem, normalizeMatchId } = require('../utils/matchUtils');

function withImageUpload(req, res, next) {
    upload.single('image')(req, res, (err) => {
        if (!err) return next();
        if (err.name === 'MulterError' && err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ message: 'Image size cannot exceed 5MB' });
        }
        return res.status(err.statusCode || 400).json({ message: err.message || 'Invalid image upload' });
    });
}

function getUploadedImageURL(req) {
    if (!req.file) return '';
    return `${req.protocol}://${req.get('host')}/uploads/items/${req.file.filename}`;
}

async function getUploadedImageHash(req) {
    if (!req.file?.path) return '';
    const fileBuffer = await fs.readFile(req.file.path);
    return crypto.createHash('sha1').update(fileBuffer).digest('hex');
}

function serializeItemPreview(item, matchScore = null) {
    return {
        _id: item._id,
        title: item.title,
        type: item.type,
        category: item.category || 'other',
        location: item.location || '',
        imageURL: item.imageURL || item.image || '',
        matchScore
    };
}

function serializeUserPreview(user) {
    if (!user) return null;

    return {
        _id: user._id,
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        name: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim(),
        email: user.email || '',
        avatar: user.avatar || ''
    };
}

async function createMatchArtifacts(req, item, match) {
    const io = req.app.locals?.io;
    const currentUser = serializeUserPreview(req.user);
    const sourceItem = item;
    const matchedUser = serializeUserPreview(match.postedBy);

    if (!matchedUser?._id || !sourceItem?.postedBy?._id) {
        return null;
    }

    const matchedItem = store.getItemById(match._id);
    if (!matchedItem) {
        return null;
    }

    const isSourceLost = sourceItem.type === 'Lost';
    const lostItem = isSourceLost ? sourceItem : matchedItem;
    const foundItem = isSourceLost ? matchedItem : sourceItem;
    const lostUserId = isSourceLost ? sourceItem.postedBy._id : matchedUser._id;
    const foundUserId = isSourceLost ? matchedUser._id : sourceItem.postedBy._id;
    const lostUser = isSourceLost ? currentUser : matchedUser;
    const foundUser = isSourceLost ? matchedUser : currentUser;

    store.ensureChatSession({
        userAId: lostUserId,
        userBId: foundUserId,
        items: [lostItem, foundItem]
    });

    const matchId = normalizeMatchId(lostUserId, foundUserId);
    const matchMessage = 'Your item has been matched. You can now chat with the user who found it.';

    const notification = store.createNotification({
        user: lostUserId,
        type: 'match',
        title: 'Item matched',
        message: matchMessage,
        matchId,
        item: lostItem._id,
        matchedItem: foundItem._id,
        otherUser: foundUserId
    });

    const lostPayload = {
        notificationId: notification._id,
        matchId,
        title: notification.title,
        message: notification.message,
        myItem: serializeItemPreview(lostItem),
        matchedItem: serializeItemPreview(foundItem, match.matchScore),
        otherUser: foundUser,
        chatReady: true
    };

    const foundPayload = {
        matchId,
        title: 'Chat ready',
        message: 'A matching lost report was found. A chat is ready for you now.',
        myItem: serializeItemPreview(foundItem),
        matchedItem: serializeItemPreview(lostItem, match.matchScore),
        otherUser: lostUser,
        chatReady: true
    };

    if (io) {
        io.to(String(lostUserId)).emit('item_match', lostPayload);
        io.to(String(foundUserId)).emit('item_match', foundPayload);
    }

    return { matchId, notificationId: notification._id };
}

async function createMatchNotifications(req, item, matches) {
    if (!matches?.length) {
        return [];
    }

    const results = [];
    for (const match of matches) {
        results.push(await createMatchArtifacts(req, item, match));
    }
    return results;
}

router.post('/upload', auth, withImageUpload, async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'No image file uploaded' });

        return res.status(201).json({
            imageURL: getUploadedImageURL(req),
            filename: req.file.filename
        });
    } catch (err) {
        console.error('POST /items/upload error:', err);
        return res.status(500).json({ message: 'Server error' });
    }
});

router.get('/', auth, async (req, res) => {
    try {
        const { type, category, search, limit = 50, page = 1 } = req.query;
        const items = store.listItems({
            type,
            category,
            search,
            limit,
            page,
            status: 'active'
        });

        return res.json(items);
    } catch (err) {
        console.error('GET /items error:', err);
        return res.status(500).json({ message: 'Server error' });
    }
});

router.get('/:id', auth, async (req, res) => {
    try {
        const item = store.getItemById(req.params.id);
        if (!item) return res.status(404).json({ message: 'Item not found' });

        const updatedItem = store.incrementItemViews(req.params.id);
        return res.json(updatedItem);
    } catch (_err) {
        return res.status(500).json({ message: 'Server error' });
    }
});

router.post('/lost', auth, withImageUpload, async (req, res) => {
    try {
        const { title, category, description, location, date, imageURL } = req.body;
        const uploadedImageURL = getUploadedImageURL(req);
        const uploadedImageHash = await getUploadedImageHash(req);

        if (!title || !description) {
            return res.status(400).json({ message: 'Title and description are required' });
        }

        const item = store.createItem({
            title,
            category,
            description,
            location,
            date: date || new Date().toISOString(),
            imageURL: uploadedImageURL || imageURL || '',
            imageHash: uploadedImageHash,
            type: 'Lost',
            postedBy: req.user._id
        });

        const matches = await findPotentialMatchesForItem(item);
        return res.status(201).json({ item, matches });
    } catch (err) {
        console.error('POST /lost error:', err);
        return res.status(500).json({ message: 'Server error: ' + err.message });
    }
});

router.post('/found', auth, withImageUpload, async (req, res) => {
    try {
        const { title, category, description, location, date, imageURL } = req.body;
        const uploadedImageURL = getUploadedImageURL(req);
        const uploadedImageHash = await getUploadedImageHash(req);

        if (!title || !description) {
            return res.status(400).json({ message: 'Title and description are required' });
        }

        const item = store.createItem({
            title,
            category,
            description,
            location,
            date: date || new Date().toISOString(),
            imageURL: uploadedImageURL || imageURL || '',
            imageHash: uploadedImageHash,
            type: 'Found',
            postedBy: req.user._id
        });

        const matches = await findPotentialMatchesForItem(item);
        await createMatchNotifications(req, item, matches);
        return res.status(201).json({ item, matches });
    } catch (err) {
        console.error('POST /found error:', err);
        return res.status(500).json({ message: 'Server error: ' + err.message });
    }
});

router.put('/:id', auth, async (req, res) => {
    try {
        const item = store.getItemById(req.params.id);
        if (!item) return res.status(404).json({ message: 'Item not found' });

        if (item.postedBy?._id !== req.user._id) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        const updatedItem = store.updateItem(req.params.id, req.body);
        return res.json(updatedItem);
    } catch (_err) {
        return res.status(500).json({ message: 'Server error' });
    }
});

router.delete('/:id', auth, async (req, res) => {
    try {
        const item = store.getItemById(req.params.id);
        if (!item) return res.status(404).json({ message: 'Item not found' });

        if (item.postedBy?._id !== req.user._id) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        store.deleteItem(req.params.id);
        return res.json({ message: 'Item deleted' });
    } catch (_err) {
        return res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
