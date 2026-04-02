const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const store = require('../data/store');
const { enrichItemsWithMatches, buildMatchSummary } = require('../utils/matchUtils');

router.get('/', auth, async (req, res) => {
    try {
        const userId = req.user._id;
        const chats = store.listChatsForUser(userId);
        const notifications = store.listNotificationsForUser(userId, 8);
        const existingMatchIds = new Set(chats.map((chat) => chat.matchId));
        const rawItems = store.listItemsByUser(userId);
        const myItems = await enrichItemsWithMatches(rawItems, {
            userId,
            existingMatchIds
        });

        const myLostItems = myItems.filter((item) => item.type === 'Lost');
        const myFoundItems = myItems.filter((item) => item.type === 'Found');
        const matchSummary = buildMatchSummary(myItems);

        const chatSummary = chats.map((chat) => {
            const other = chat.participants.find(
                (participant) => participant._id !== userId
            );
            const lastMessage = chat.messages[chat.messages.length - 1] || null;
            const primaryContext = chat.relatedItems?.[0] || null;
            const unread = chat.messages.filter(
                (message) => message.receiver === userId && !message.read
            ).length;

            return {
                matchId: chat.matchId,
                otherUser: other,
                lastMessage,
                unread,
                relatedItems: chat.relatedItems || [],
                contextLabel: primaryContext
                    ? `${primaryContext.type}: ${primaryContext.title}`
                    : 'Direct conversation'
            };
        });

        res.json({
            myItems,
            myLostItems,
            myFoundItems,
            matchSummary,
            chatSummary,
            notifications,
            stats: {
                myLost: myLostItems.length,
                myFound: myFoundItems.length,
                myMatches: matchSummary.length,
                activeChats: chatSummary.length
            }
        });
    } catch (err) {
        console.error('Dashboard error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
