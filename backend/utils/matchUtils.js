const store = require('../data/store');

function normalizeMatchId(userA, userB) {
    return [String(userA), String(userB)].sort().join('_');
}

function toPlainObject(value) {
    if (!value) return value;
    return typeof value.toObject === 'function' ? value.toObject() : value;
}

function getNormalizedTokens(item) {
    return new Set(
        [item.title, item.description, item.location]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .split(/\s+/)
            .map((word) => word.trim())
            .filter((word) => word.length > 2)
    );
}

function scoreMatchCandidate(sourceItem, candidate) {
    const sourceTokens = getNormalizedTokens(sourceItem || {});
    const candidateTokens = getNormalizedTokens(candidate || {});
    let score = 0;

    if (sourceItem?.imageHash && candidate?.imageHash && sourceItem.imageHash === candidate.imageHash) {
        score += 10;
    }

    if (
        sourceItem?.category &&
        candidate?.category &&
        sourceItem.category !== 'other' &&
        sourceItem.category === candidate.category
    ) {
        score += 4;
    }

    if (sourceItem?.location && candidate?.location) {
        const sourceLocation = sourceItem.location.trim().toLowerCase();
        const candidateLocation = candidate.location.trim().toLowerCase();
        if (sourceLocation && sourceLocation === candidateLocation) {
            score += 3;
        }
    }

    sourceTokens.forEach((token) => {
        if (candidateTokens.has(token)) score += 1;
    });

    return score;
}

async function findPotentialMatchesForItem(item, options = {}) {
    const { limit = 5 } = options;
    const sourceItem = toPlainObject(item);

    if (!sourceItem?.type) {
        return [];
    }

    const candidates = store.listMatchCandidateItems(sourceItem);

    return candidates
        .map((candidate) => ({
            ...candidate,
            matchScore: scoreMatchCandidate(sourceItem, candidate)
        }))
        .filter((candidate) => candidate.matchScore > 0)
        .sort((left, right) => {
            if (right.matchScore !== left.matchScore) {
                return right.matchScore - left.matchScore;
            }
            return new Date(right.createdAt) - new Date(left.createdAt);
        })
        .slice(0, limit);
}

function serializeMatchCandidate(userId, candidate, existingMatchIds = new Set()) {
    const otherUserId = candidate?.postedBy?._id || candidate?.postedBy;
    const matchId = normalizeMatchId(userId, otherUserId);

    return {
        ...candidate,
        matchId,
        hasConversation: existingMatchIds.has(matchId)
    };
}

async function enrichItemsWithMatches(items, options = {}) {
    const { userId, existingMatchIds = new Set(), limit = 5 } = options;

    return Promise.all(items.map(async (item) => {
        const plainItem = toPlainObject(item);
        const matches = await findPotentialMatchesForItem(plainItem, { limit });

        return {
            ...plainItem,
            matches: matches.map((candidate) =>
                serializeMatchCandidate(userId, candidate, existingMatchIds)
            )
        };
    }));
}

function buildMatchSummary(items) {
    const summary = [];
    const seen = new Set();

    items.forEach((item) => {
        (item.matches || []).forEach((match) => {
            const key = `${item._id}_${match._id}`;
            if (seen.has(key)) return;
            seen.add(key);

            summary.push({
                matchId: match.matchId,
                hasConversation: match.hasConversation,
                myItem: {
                    _id: item._id,
                    title: item.title,
                    type: item.type,
                    category: item.category
                },
                matchedItem: {
                    _id: match._id,
                    title: match.title,
                    type: match.type,
                    category: match.category,
                    matchScore: match.matchScore
                },
                otherUser: match.postedBy
            });
        });
    });

    return summary.sort((left, right) => {
        if (left.hasConversation !== right.hasConversation) {
            return Number(left.hasConversation) - Number(right.hasConversation);
        }

        return (right.matchedItem?.matchScore || 0) - (left.matchedItem?.matchScore || 0);
    });
}

module.exports = {
    normalizeMatchId,
    findPotentialMatchesForItem,
    serializeMatchCandidate,
    enrichItemsWithMatches,
    buildMatchSummary
};
