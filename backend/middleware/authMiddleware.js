const jwt = require('jsonwebtoken');
const store = require('../data/store');

function getTokenFromRequest(req) {
    const authHeader = String(req.headers.authorization || '').trim();

    if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
        return authHeader.slice(7).trim();
    }

    return String(req.headers['x-auth-token'] || req.query.token || '').trim();
}

const auth = async (req, res, next) => {
    try {
        const token = getTokenFromRequest(req);
        if (!token) {
            return res.status(401).json({ message: 'No token provided, authorization denied' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = store.getUserById(decoded.id);
        if (!user) return res.status(401).json({ message: 'User not found' });

        req.user = user;
        next();
    } catch (_error) {
        return res.status(401).json({ message: 'Token is not valid' });
    }
};

module.exports = auth;
module.exports.getTokenFromRequest = getTokenFromRequest;
