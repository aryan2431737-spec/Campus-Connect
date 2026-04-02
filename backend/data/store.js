const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const dataRoot = path.join(__dirname, '..', 'data');
const isVercel = Boolean(process.env.VERCEL);
const defaultDbPath = isVercel ? '/tmp/lostandfound.sqlite' : path.join(dataRoot, 'lostandfound.sqlite');
fs.mkdirSync(dataRoot, { recursive: true });

const configuredDbPath = process.env.SQLITE_PATH || defaultDbPath;
const databasePath = path.isAbsolute(configuredDbPath)
    ? configuredDbPath
    : path.join(__dirname, '..', configuredDbPath);

fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const db = new DatabaseSync(databasePath);
let initialized = false;

function nowIso() {
    return new Date().toISOString();
}

function createId() {
    return crypto.randomUUID();
}

function run(sql, params = {}) {
    return db.prepare(sql).run(params);
}

function get(sql, params = {}) {
    return db.prepare(sql).get(params) || null;
}

function all(sql, params = {}) {
    return db.prepare(sql).all(params);
}

function withTransaction(fn) {
    db.exec('BEGIN');
    try {
        const result = fn();
        db.exec('COMMIT');
        return result;
    } catch (error) {
        try {
            db.exec('ROLLBACK');
        } catch (_rollbackError) {
            // Ignore rollback errors; the original error is the actionable one.
        }
        throw error;
    }
}

function initializeDatabase() {
    if (initialized) {
        return;
    }

    db.exec(`
        PRAGMA foreign_keys = ON;
        PRAGMA journal_mode = WAL;

        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            firstName TEXT NOT NULL,
            lastName TEXT NOT NULL,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            passwordHash TEXT NOT NULL,
            studentId TEXT NOT NULL UNIQUE,
            contact TEXT NOT NULL,
            avatar TEXT NOT NULL DEFAULT '',
            role TEXT NOT NULL DEFAULT 'user',
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS items (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            itemType TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT 'other',
            description TEXT NOT NULL,
            location TEXT NOT NULL DEFAULT '',
            eventDate TEXT NOT NULL,
            imageURL TEXT NOT NULL DEFAULT '',
            image TEXT NOT NULL DEFAULT '',
            imageHash TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'active',
            postedById TEXT NOT NULL,
            matchedWithId TEXT DEFAULT NULL,
            views INTEGER NOT NULL DEFAULT 0,
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL,
            FOREIGN KEY (postedById) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (matchedWithId) REFERENCES items(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS chats (
            id TEXT PRIMARY KEY,
            matchId TEXT NOT NULL UNIQUE,
            lastActivity TEXT NOT NULL,
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS chat_participants (
            chatId TEXT NOT NULL,
            userId TEXT NOT NULL,
            PRIMARY KEY (chatId, userId),
            FOREIGN KEY (chatId) REFERENCES chats(id) ON DELETE CASCADE,
            FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS chat_related_items (
            chatId TEXT NOT NULL,
            itemId TEXT NOT NULL,
            title TEXT NOT NULL,
            itemType TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT 'other',
            imageURL TEXT NOT NULL DEFAULT '',
            PRIMARY KEY (chatId, itemId),
            FOREIGN KEY (chatId) REFERENCES chats(id) ON DELETE CASCADE,
            FOREIGN KEY (itemId) REFERENCES items(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS chat_messages (
            id TEXT PRIMARY KEY,
            chatId TEXT NOT NULL,
            senderId TEXT NOT NULL,
            receiverId TEXT,
            message TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            isRead INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (chatId) REFERENCES chats(id) ON DELETE CASCADE,
            FOREIGN KEY (senderId) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (receiverId) REFERENCES users(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS notifications (
            id TEXT PRIMARY KEY,
            userId TEXT NOT NULL,
            notificationType TEXT NOT NULL DEFAULT 'match',
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            matchId TEXT NOT NULL DEFAULT '',
            itemId TEXT DEFAULT NULL,
            matchedItemId TEXT DEFAULT NULL,
            otherUserId TEXT DEFAULT NULL,
            isRead INTEGER NOT NULL DEFAULT 0,
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL,
            FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (itemId) REFERENCES items(id) ON DELETE SET NULL,
            FOREIGN KEY (matchedItemId) REFERENCES items(id) ON DELETE SET NULL,
            FOREIGN KEY (otherUserId) REFERENCES users(id) ON DELETE SET NULL
        );

        CREATE INDEX IF NOT EXISTS idx_items_type_status_created ON items(itemType, status, createdAt DESC);
        CREATE INDEX IF NOT EXISTS idx_items_posted_by_created ON items(postedById, createdAt DESC);
        CREATE INDEX IF NOT EXISTS idx_chats_match_id ON chats(matchId);
        CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_timestamp ON chat_messages(chatId, timestamp ASC);
        CREATE INDEX IF NOT EXISTS idx_notifications_user_read_created ON notifications(userId, isRead, createdAt DESC);
    `);

    initialized = true;
}

function ensureInitialized() {
    if (!initialized) {
        initializeDatabase();
    }
}

function toUser(row, options = {}) {
    if (!row) return null;

    const user = {
        _id: row.id,
        firstName: row.firstName || '',
        lastName: row.lastName || '',
        name: row.name || `${row.firstName || ''} ${row.lastName || ''}`.trim(),
        email: row.email || '',
        studentId: row.studentId || '',
        contact: row.contact || '',
        avatar: row.avatar || '',
        role: row.role || 'user',
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
    };

    if (options.includePasswordHash) {
        user.passwordHash = row.passwordHash || '';
    }

    return user;
}

function toPrefixedUser(row, prefix, options = {}) {
    const id = row[`${prefix}Id`];
    if (!id) return null;

    const user = {
        _id: id,
        firstName: row[`${prefix}FirstName`] || '',
        lastName: row[`${prefix}LastName`] || '',
        name: row[`${prefix}Name`] || `${row[`${prefix}FirstName`] || ''} ${row[`${prefix}LastName`] || ''}`.trim(),
        avatar: row[`${prefix}Avatar`] || ''
    };

    if (options.includeEmail) {
        user.email = row[`${prefix}Email`] || '';
    }

    if (options.includeContact) {
        user.contact = row[`${prefix}Contact`] || '';
    }

    if (options.includeStudentId) {
        user.studentId = row[`${prefix}StudentId`] || '';
    }

    return user;
}

function toItem(row, options = {}) {
    if (!row) return null;

    return {
        _id: row.id,
        title: row.title,
        type: row.itemType,
        category: row.category || 'other',
        description: row.description,
        location: row.location || '',
        date: row.eventDate,
        imageURL: row.imageURL || '',
        image: row.image || '',
        imageHash: row.imageHash || '',
        status: row.status || 'active',
        postedBy: options.postedBy || row.postedBy || null,
        matchedWith: row.matchedWithId || null,
        views: Number(row.views || 0),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
    };
}

function toNotification(row) {
    if (!row) return null;

    return {
        _id: row.id,
        type: row.notificationType,
        title: row.title,
        message: row.message,
        matchId: row.matchId || '',
        item: row.itemId || null,
        matchedItem: row.matchedItemId || null,
        otherUser: toPrefixedUser(row, 'otherUser'),
        read: Boolean(row.isRead),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
    };
}

function buildInClause(prefix, values) {
    const params = {};
    const placeholders = values.map((value, index) => {
        const key = `${prefix}${index}`;
        params[key] = value;
        return `:${key}`;
    });

    return { params, placeholders };
}

const joinedItemSelect = `
    SELECT
        i.*,
        u.id AS postedById,
        u.firstName AS postedByFirstName,
        u.lastName AS postedByLastName,
        u.name AS postedByName,
        u.email AS postedByEmail,
        u.contact AS postedByContact,
        u.avatar AS postedByAvatar,
        u.studentId AS postedByStudentId
    FROM items i
    JOIN users u ON u.id = i.postedById
`;

function getUserById(id, options = {}) {
    ensureInitialized();
    const row = get('SELECT * FROM users WHERE id = :id', { id });
    return toUser(row, options);
}

function getUserByEmail(email, options = {}) {
    ensureInitialized();
    const row = get('SELECT * FROM users WHERE lower(email) = lower(:email)', { email });
    return toUser(row, options);
}

function getUserByStudentId(studentId, options = {}) {
    ensureInitialized();
    const row = get('SELECT * FROM users WHERE studentId = :studentId', { studentId });
    return toUser(row, options);
}

function findUserByLoginValue(loginValue, options = {}) {
    ensureInitialized();
    const normalizedValue = String(loginValue || '').trim().toLowerCase();
    const studentId = String(loginValue || '').trim();
    const row = get(
        `SELECT * FROM users
         WHERE lower(email) = :normalizedValue OR studentId = :studentId
         LIMIT 1`,
        { normalizedValue, studentId }
    );

    return toUser(row, options);
}

function createUser({ firstName, lastName, email, passwordHash, studentId, contact, avatar = '', role = 'user' }) {
    ensureInitialized();
    const timestamp = nowIso();
    const id = createId();
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const name = `${firstName || ''} ${lastName || ''}`.trim();

    run(
        `INSERT INTO users (
            id, firstName, lastName, name, email, passwordHash, studentId, contact, avatar, role, createdAt, updatedAt
        ) VALUES (
            :id, :firstName, :lastName, :name, :email, :passwordHash, :studentId, :contact, :avatar, :role, :createdAt, :updatedAt
        )`,
        {
            id,
            firstName: String(firstName || '').trim(),
            lastName: String(lastName || '').trim(),
            name,
            email: normalizedEmail,
            passwordHash,
            studentId: String(studentId || '').trim(),
            contact: String(contact || '').trim(),
            avatar: String(avatar || '').trim(),
            role,
            createdAt: timestamp,
            updatedAt: timestamp
        }
    );

    return getUserById(id);
}

function updateUser(id, updates = {}) {
    ensureInitialized();
    const existing = getUserById(id, { includePasswordHash: true });
    if (!existing) {
        return null;
    }

    const nextFirstName = updates.firstName !== undefined ? String(updates.firstName).trim() : existing.firstName;
    const nextLastName = updates.lastName !== undefined ? String(updates.lastName).trim() : existing.lastName;
    const nextContact = updates.contact !== undefined ? String(updates.contact).trim() : existing.contact;
    const nextAvatar = updates.avatar !== undefined ? String(updates.avatar).trim() : existing.avatar;
    const nextName = `${nextFirstName} ${nextLastName}`.trim();
    const timestamp = nowIso();

    run(
        `UPDATE users
         SET firstName = :firstName,
             lastName = :lastName,
             name = :name,
             contact = :contact,
             avatar = :avatar,
             updatedAt = :updatedAt
         WHERE id = :id`,
        {
            id,
            firstName: nextFirstName,
            lastName: nextLastName,
            name: nextName,
            contact: nextContact,
            avatar: nextAvatar,
            updatedAt: timestamp
        }
    );

    return getUserById(id);
}

function getRawItemRecordById(id) {
    ensureInitialized();
    return get('SELECT * FROM items WHERE id = :id', { id });
}

function getItemById(id) {
    ensureInitialized();
    const row = get(`${joinedItemSelect} WHERE i.id = :id`, { id });
    if (!row) return null;

    return toItem(row, {
        postedBy: toPrefixedUser(row, 'postedBy', { includeEmail: true, includeContact: true, includeStudentId: true })
    });
}

function getItemsByIds(ids = []) {
    ensureInitialized();
    const uniqueIds = [...new Set((ids || []).filter(Boolean))];
    if (!uniqueIds.length) {
        return [];
    }

    const { params, placeholders } = buildInClause('itemId', uniqueIds);
    const rows = all(
        `${joinedItemSelect}
         WHERE i.id IN (${placeholders.join(', ')})`,
        params
    );

    const itemsById = new Map(
        rows.map((row) => [
            row.id,
            toItem(row, {
                postedBy: toPrefixedUser(row, 'postedBy', { includeEmail: true, includeContact: true, includeStudentId: true })
            })
        ])
    );

    return uniqueIds.map((id) => itemsById.get(id)).filter(Boolean);
}

function listItems(options = {}) {
    ensureInitialized();
    const {
        type,
        category,
        search,
        limit = 50,
        page = 1,
        status,
        postedById
    } = options;

    const params = {
        limit: Number(limit),
        offset: (Number(page) - 1) * Number(limit)
    };

    const where = [];

    if (status) {
        where.push('i.status = :status');
        params.status = status;
    }

    if (type) {
        where.push('i.itemType = :itemType');
        params.itemType = type;
    }

    if (category) {
        where.push('i.category = :category');
        params.category = category;
    }

    if (postedById) {
        where.push('i.postedById = :postedById');
        params.postedById = postedById;
    }

    if (search) {
        where.push('(lower(i.title) LIKE :search OR lower(i.description) LIKE :search OR lower(i.location) LIKE :search)');
        params.search = `%${String(search).trim().toLowerCase()}%`;
    }

    const rows = all(
        `${joinedItemSelect}
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY datetime(i.createdAt) DESC
         LIMIT :limit OFFSET :offset`,
        params
    );

    return rows.map((row) =>
        toItem(row, {
            postedBy: toPrefixedUser(row, 'postedBy', { includeEmail: true, includeContact: true, includeStudentId: true })
        })
    );
}

function listItemsByUser(userId) {
    return listItems({
        postedById: userId,
        limit: 500,
        page: 1
    });
}

function listMatchCandidateItems(sourceItem) {
    ensureInitialized();
    const sourceUserId = sourceItem?.postedBy?._id || sourceItem?.postedBy;
    const oppositeType = sourceItem?.type === 'Lost' ? 'Found' : 'Lost';

    const rows = all(
        `${joinedItemSelect}
         WHERE i.itemType = :itemType
           AND i.status = 'active'
           AND i.postedById != :postedById
           AND i.id != :itemId
         ORDER BY datetime(i.createdAt) DESC`,
        {
            itemType: oppositeType,
            postedById: sourceUserId,
            itemId: sourceItem?._id || ''
        }
    );

    return rows.map((row) =>
        toItem(row, {
            postedBy: toPrefixedUser(row, 'postedBy', { includeEmail: true, includeContact: true, includeStudentId: true })
        })
    );
}

function createItem({
    title,
    type,
    category = 'other',
    description,
    location = '',
    date,
    imageURL = '',
    image = '',
    imageHash = '',
    status = 'active',
    postedBy,
    matchedWith = null
}) {
    ensureInitialized();
    const timestamp = nowIso();
    const id = createId();

    run(
        `INSERT INTO items (
            id, title, itemType, category, description, location, eventDate, imageURL, image, imageHash, status,
            postedById, matchedWithId, views, createdAt, updatedAt
        ) VALUES (
            :id, :title, :itemType, :category, :description, :location, :eventDate, :imageURL, :image, :imageHash,
            :status, :postedById, :matchedWithId, 0, :createdAt, :updatedAt
        )`,
        {
            id,
            title: String(title || '').trim(),
            itemType: type,
            category: category || 'other',
            description: String(description || '').trim(),
            location: String(location || '').trim(),
            eventDate: date ? new Date(date).toISOString() : timestamp,
            imageURL: String(imageURL || '').trim(),
            image: String(image || '').trim(),
            imageHash: String(imageHash || '').trim(),
            status,
            postedById: postedBy,
            matchedWithId: matchedWith,
            createdAt: timestamp,
            updatedAt: timestamp
        }
    );

    return getItemById(id);
}

function incrementItemViews(id) {
    ensureInitialized();
    run(
        `UPDATE items
         SET views = views + 1,
             updatedAt = :updatedAt
         WHERE id = :id`,
        {
            id,
            updatedAt: nowIso()
        }
    );

    return getItemById(id);
}

function updateItem(id, updates = {}) {
    ensureInitialized();
    const rawItem = getRawItemRecordById(id);
    if (!rawItem) {
        return null;
    }

    const nextValues = {
        title: updates.title !== undefined ? String(updates.title).trim() : rawItem.title,
        category: updates.category !== undefined ? String(updates.category).trim() : rawItem.category,
        description: updates.description !== undefined ? String(updates.description).trim() : rawItem.description,
        location: updates.location !== undefined ? String(updates.location).trim() : rawItem.location,
        eventDate: updates.date !== undefined ? new Date(updates.date).toISOString() : rawItem.eventDate,
        imageURL: updates.imageURL !== undefined ? String(updates.imageURL).trim() : rawItem.imageURL,
        status: updates.status !== undefined ? String(updates.status).trim() : rawItem.status,
        updatedAt: nowIso()
    };

    run(
        `UPDATE items
         SET title = :title,
             category = :category,
             description = :description,
             location = :location,
             eventDate = :eventDate,
             imageURL = :imageURL,
             status = :status,
             updatedAt = :updatedAt
         WHERE id = :id`,
        {
            id,
            ...nextValues
        }
    );

    return getItemById(id);
}

function deleteItem(id) {
    ensureInitialized();
    return run('DELETE FROM items WHERE id = :id', { id });
}

function normalizeMatchId(userA, userB) {
    return [String(userA), String(userB)].sort().join('_');
}

function getChatRowByMatchId(matchId) {
    ensureInitialized();
    return get('SELECT * FROM chats WHERE matchId = :matchId', { matchId });
}

function getChatParticipants(chatId) {
    ensureInitialized();
    return all(
        `SELECT
            u.id,
            u.firstName,
            u.lastName,
            u.name,
            u.avatar
         FROM chat_participants cp
         JOIN users u ON u.id = cp.userId
         WHERE cp.chatId = :chatId
         ORDER BY u.firstName ASC, u.lastName ASC`,
        { chatId }
    ).map((row) => ({
        _id: row.id,
        firstName: row.firstName || '',
        lastName: row.lastName || '',
        name: row.name || `${row.firstName || ''} ${row.lastName || ''}`.trim(),
        avatar: row.avatar || ''
    }));
}

function getChatRelatedItems(chatId) {
    ensureInitialized();
    return all(
        `SELECT itemId, title, itemType, category, imageURL
         FROM chat_related_items
         WHERE chatId = :chatId
         ORDER BY title ASC`,
        { chatId }
    ).map((row) => ({
        item: row.itemId,
        title: row.title,
        type: row.itemType,
        category: row.category || 'other',
        imageURL: row.imageURL || ''
    }));
}

function getChatMessages(chatId) {
    ensureInitialized();
    return all(
        `SELECT
            m.id,
            m.receiverId,
            m.message,
            m.timestamp,
            m.isRead,
            s.id AS senderId,
            s.firstName AS senderFirstName,
            s.lastName AS senderLastName,
            s.name AS senderName,
            s.avatar AS senderAvatar
         FROM chat_messages m
         JOIN users s ON s.id = m.senderId
         WHERE m.chatId = :chatId
         ORDER BY datetime(m.timestamp) ASC, m.id ASC`,
        { chatId }
    ).map((row) => ({
        _id: row.id,
        sender: {
            _id: row.senderId,
            firstName: row.senderFirstName || '',
            lastName: row.senderLastName || '',
            name: row.senderName || `${row.senderFirstName || ''} ${row.senderLastName || ''}`.trim(),
            avatar: row.senderAvatar || ''
        },
        receiver: row.receiverId || null,
        message: row.message,
        timestamp: row.timestamp,
        read: Boolean(row.isRead)
    }));
}

function hydrateChat(chatRow) {
    if (!chatRow) return null;

    return {
        _id: chatRow.id,
        matchId: chatRow.matchId,
        participants: getChatParticipants(chatRow.id),
        relatedItems: getChatRelatedItems(chatRow.id),
        messages: getChatMessages(chatRow.id),
        lastActivity: chatRow.lastActivity,
        createdAt: chatRow.createdAt,
        updatedAt: chatRow.updatedAt
    };
}

function getChatByMatchId(matchId) {
    return hydrateChat(getChatRowByMatchId(matchId));
}

function getChatParticipantIds(matchId) {
    ensureInitialized();
    const chatRow = getChatRowByMatchId(matchId);
    if (!chatRow) {
        return [];
    }

    return all(
        'SELECT userId FROM chat_participants WHERE chatId = :chatId ORDER BY userId ASC',
        { chatId: chatRow.id }
    ).map((row) => row.userId);
}

function addMissingRelatedItems(chatId, items = []) {
    items.forEach((item) => {
        run(
            `INSERT OR IGNORE INTO chat_related_items (
                chatId, itemId, title, itemType, category, imageURL
            ) VALUES (
                :chatId, :itemId, :title, :itemType, :category, :imageURL
            )`,
            {
                chatId,
                itemId: item._id,
                title: item.title,
                itemType: item.type,
                category: item.category || 'other',
                imageURL: item.imageURL || item.image || ''
            }
        );
    });
}

function maybeLinkMatchedItems(items = []) {
    if (items.length !== 2) {
        return;
    }

    const [firstItem, secondItem] = items;

    if (!firstItem || !secondItem || firstItem.type === secondItem.type) {
        return;
    }

    run(
        `UPDATE items
         SET matchedWithId = COALESCE(matchedWithId, :matchedWithId),
             updatedAt = :updatedAt
         WHERE id = :id`,
        {
            id: firstItem._id,
            matchedWithId: secondItem._id,
            updatedAt: nowIso()
        }
    );

    run(
        `UPDATE items
         SET matchedWithId = COALESCE(matchedWithId, :matchedWithId),
             updatedAt = :updatedAt
         WHERE id = :id`,
        {
            id: secondItem._id,
            matchedWithId: firstItem._id,
            updatedAt: nowIso()
        }
    );
}

function ensureChatSession({ userAId, userBId, items = [] }) {
    ensureInitialized();
    const participantIds = [...new Set([String(userAId), String(userBId)])];
    const matchId = normalizeMatchId(userAId, userBId);

    return withTransaction(() => {
        let chatRow = getChatRowByMatchId(matchId);
        const timestamp = nowIso();

        if (!chatRow) {
            const chatId = createId();
            run(
                `INSERT INTO chats (id, matchId, lastActivity, createdAt, updatedAt)
                 VALUES (:id, :matchId, :lastActivity, :createdAt, :updatedAt)`,
                {
                    id: chatId,
                    matchId,
                    lastActivity: timestamp,
                    createdAt: timestamp,
                    updatedAt: timestamp
                }
            );

            participantIds.forEach((userId) => {
                run(
                    `INSERT OR IGNORE INTO chat_participants (chatId, userId)
                     VALUES (:chatId, :userId)`,
                    {
                        chatId,
                        userId
                    }
                );
            });

            chatRow = getChatRowByMatchId(matchId);
        } else {
            participantIds.forEach((userId) => {
                run(
                    `INSERT OR IGNORE INTO chat_participants (chatId, userId)
                     VALUES (:chatId, :userId)`,
                    {
                        chatId: chatRow.id,
                        userId
                    }
                );
            });
        }

        addMissingRelatedItems(chatRow.id, items);
        maybeLinkMatchedItems(items);

        run(
            `UPDATE chats
             SET updatedAt = :updatedAt
             WHERE id = :id`,
            {
                id: chatRow.id,
                updatedAt: nowIso()
            }
        );

        return getChatByMatchId(matchId);
    });
}

function appendChatMessage({ matchId, senderId, receiverId, message }) {
    ensureInitialized();

    return withTransaction(() => {
        let chatRow = getChatRowByMatchId(matchId);

        if (!chatRow) {
            const participantIds = String(matchId || '')
                .split('_')
                .filter(Boolean);

            if (participantIds.length !== 2 || !participantIds.includes(String(senderId))) {
                throw new Error('Not authorized to send message in this chat');
            }

            const timestamp = nowIso();
            const chatId = createId();

            run(
                `INSERT INTO chats (id, matchId, lastActivity, createdAt, updatedAt)
                 VALUES (:id, :matchId, :lastActivity, :createdAt, :updatedAt)`,
                {
                    id: chatId,
                    matchId,
                    lastActivity: timestamp,
                    createdAt: timestamp,
                    updatedAt: timestamp
                }
            );

            participantIds.forEach((userId) => {
                run(
                    `INSERT OR IGNORE INTO chat_participants (chatId, userId)
                     VALUES (:chatId, :userId)`,
                    {
                        chatId,
                        userId
                    }
                );
            });

            chatRow = getChatRowByMatchId(matchId);
        }

        const participantIds = all(
            'SELECT userId FROM chat_participants WHERE chatId = :chatId',
            { chatId: chatRow.id }
        ).map((row) => row.userId);

        if (!participantIds.includes(String(senderId))) {
            throw new Error('Not authorized to send message in this chat');
        }

        const timestamp = nowIso();
        run(
            `INSERT INTO chat_messages (
                id, chatId, senderId, receiverId, message, timestamp, isRead
            ) VALUES (
                :id, :chatId, :senderId, :receiverId, :message, :timestamp, 0
            )`,
            {
                id: createId(),
                chatId: chatRow.id,
                senderId,
                receiverId,
                message: String(message || '').trim(),
                timestamp
            }
        );

        run(
            `UPDATE chats
             SET lastActivity = :lastActivity,
                 updatedAt = :updatedAt
             WHERE id = :id`,
            {
                id: chatRow.id,
                lastActivity: timestamp,
                updatedAt: timestamp
            }
        );

        return getChatByMatchId(matchId);
    });
}

function markChatMessagesRead(matchId, userId) {
    ensureInitialized();
    const chatRow = getChatRowByMatchId(matchId);
    if (!chatRow) {
        return 0;
    }

    const result = run(
        `UPDATE chat_messages
         SET isRead = 1
         WHERE chatId = :chatId
           AND receiverId = :userId
           AND isRead = 0`,
        {
            chatId: chatRow.id,
            userId
        }
    );

    return Number(result.changes || 0);
}

function listChatsForUser(userId) {
    ensureInitialized();
    const rows = all(
        `SELECT c.*
         FROM chats c
         JOIN chat_participants cp ON cp.chatId = c.id
         WHERE cp.userId = :userId
         ORDER BY datetime(c.lastActivity) DESC, datetime(c.updatedAt) DESC`,
        { userId }
    );

    return rows.map((row) => hydrateChat(row));
}

function listChatMatchIdsForUser(userId) {
    ensureInitialized();
    return all(
        `SELECT c.matchId
         FROM chats c
         JOIN chat_participants cp ON cp.chatId = c.id
         WHERE cp.userId = :userId`,
        { userId }
    ).map((row) => row.matchId);
}

function createNotification({
    user,
    type = 'match',
    title,
    message,
    matchId = '',
    item = null,
    matchedItem = null,
    otherUser = null
}) {
    ensureInitialized();
    const timestamp = nowIso();
    const id = createId();

    run(
        `INSERT INTO notifications (
            id, userId, notificationType, title, message, matchId, itemId, matchedItemId, otherUserId, isRead, createdAt, updatedAt
        ) VALUES (
            :id, :userId, :notificationType, :title, :message, :matchId, :itemId, :matchedItemId, :otherUserId, 0, :createdAt, :updatedAt
        )`,
        {
            id,
            userId: user,
            notificationType: type,
            title,
            message,
            matchId,
            itemId: item,
            matchedItemId: matchedItem,
            otherUserId: otherUser,
            createdAt: timestamp,
            updatedAt: timestamp
        }
    );

    return getNotificationById(id);
}

function getNotificationById(id) {
    ensureInitialized();
    const row = get(
        `SELECT
            n.*,
            u.id AS otherUserId,
            u.firstName AS otherUserFirstName,
            u.lastName AS otherUserLastName,
            u.name AS otherUserName,
            u.avatar AS otherUserAvatar
         FROM notifications n
         LEFT JOIN users u ON u.id = n.otherUserId
         WHERE n.id = :id`,
        { id }
    );

    return toNotification(row);
}

function listNotificationsForUser(userId, limit = 10) {
    ensureInitialized();
    const rows = all(
        `SELECT
            n.*,
            u.id AS otherUserId,
            u.firstName AS otherUserFirstName,
            u.lastName AS otherUserLastName,
            u.name AS otherUserName,
            u.avatar AS otherUserAvatar
         FROM notifications n
         LEFT JOIN users u ON u.id = n.otherUserId
         WHERE n.userId = :userId
         ORDER BY n.isRead ASC, datetime(n.createdAt) DESC
         LIMIT :limit`,
        {
            userId,
            limit: Number(limit)
        }
    );

    return rows.map((row) => toNotification(row));
}

function markNotificationsRead({ userId, matchId = null, all: markAll = false }) {
    ensureInitialized();
    const params = { userId, updatedAt: nowIso() };
    let sql = `
        UPDATE notifications
        SET isRead = 1,
            updatedAt = :updatedAt
        WHERE userId = :userId
          AND isRead = 0
    `;

    if (!markAll) {
        sql += ' AND matchId = :matchId';
        params.matchId = matchId;
    }

    const result = run(sql, params);
    return Number(result.changes || 0);
}

initializeDatabase();

module.exports = {
    db,
    databasePath,
    initializeDatabase,
    normalizeMatchId,
    getUserById,
    getUserByEmail,
    getUserByStudentId,
    findUserByLoginValue,
    createUser,
    updateUser,
    getItemById,
    getItemsByIds,
    listItems,
    listItemsByUser,
    listMatchCandidateItems,
    createItem,
    incrementItemViews,
    updateItem,
    deleteItem,
    ensureChatSession,
    appendChatMessage,
    getChatByMatchId,
    getChatParticipantIds,
    markChatMessagesRead,
    listChatsForUser,
    listChatMatchIdsForUser,
    createNotification,
    listNotificationsForUser,
    markNotificationsRead
};
