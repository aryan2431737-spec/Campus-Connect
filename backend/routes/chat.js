const express = require('express');
const auth = require('../middleware/auth');
const store = require('../data/store');
const { normalizeMatchId } = require('../utils/matchUtils');

const router = express.Router();

function resolveContextItems({ itemId, matchedItemId, currentUserId, otherUserId }) {
    const ids = [...new Set([itemId, matchedItemId].filter(Boolean))];

    if (!ids.length) {
        return [];
    }

    const items = store.getItemsByIds(ids);

    if (items.length !== ids.length) {
        throw new Error('One or more chat items could not be found');
    }

    items.forEach((item) => {
        const ownerId = item.postedBy?._id || item.postedBy;
        const isParticipantItem =
            ownerId === String(currentUserId) || ownerId === String(otherUserId);

        if (!isParticipantItem) {
            throw new Error('You can only attach items that belong to one of the chat participants');
        }
    });

    return items;
}

router.get('/user/:userId', auth, async (req, res) => {
    try {
        const chats = store.listChatsForUser(req.user._id);
        return res.json(chats);
    } catch (_err) {
        return res.status(500).json({ message: 'Server error' });
    }
});

router.post('/start', auth, async (req, res) => {
    try {
        const { otherUserId, itemId, matchedItemId } = req.body;

        if (!otherUserId || !store.getUserById(otherUserId)) {
            return res.status(400).json({ message: 'Valid otherUserId is required' });
        }

        if (String(otherUserId) === String(req.user._id)) {
            return res.status(400).json({ message: 'You cannot start a chat with yourself' });
        }

        const matchId = normalizeMatchId(req.user._id, otherUserId);
        const contextItems = resolveContextItems({
            itemId,
            matchedItemId,
            currentUserId: req.user._id,
            otherUserId
        });

        const chat = store.ensureChatSession({
            userAId: req.user._id,
            userBId: otherUserId,
            items: contextItems
        });

        store.markNotificationsRead({
            userId: req.user._id,
            matchId
        });

        return res.status(201).json(chat);
    } catch (err) {
        console.error('POST /chat/start error:', err);

        if (
            err.message === 'One or more chat items could not be found' ||
            err.message === 'You can only attach items that belong to one of the chat participants'
        ) {
            return res.status(400).json({ message: err.message });
        }

        return res.status(500).json({ message: 'Server error' });
    }
});

router.get('/:matchId', auth, async (req, res) => {
    try {
        let chat = store.getChatByMatchId(req.params.matchId);

        if (!chat) {
            return res.status(404).json({ message: 'Chat not found' });
        }

        const isParticipant = chat.participants.some(
            (participant) => participant._id === req.user._id
        );

        if (!isParticipant) {
            return res.status(403).json({ message: 'Not authorized to access this chat' });
        }

        const updatedCount = store.markChatMessagesRead(req.params.matchId, req.user._id);
        store.markNotificationsRead({
            userId: req.user._id,
            matchId: req.params.matchId
        });

        if (updatedCount > 0) {
            chat = store.getChatByMatchId(req.params.matchId);
        }

        return res.json(chat);
    } catch (err) {
        console.error('GET /chat/:matchId error:', err);
        return res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
