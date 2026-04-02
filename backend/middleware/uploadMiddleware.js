const fs = require('fs');
const path = require('path');
const multer = require('multer');

const uploadRoot = path.join(__dirname, '..', 'uploads');

function ensureDirectory(directoryPath) {
    if (!fs.existsSync(directoryPath)) {
        fs.mkdirSync(directoryPath, { recursive: true });
    }
}

ensureDirectory(uploadRoot);

const allowedMimeTypes = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif'
]);

const fileFilter = (_req, file, cb) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
        const err = new Error('Only JPG, PNG, WEBP, and GIF images are allowed');
        err.statusCode = 400;
        return cb(err);
    }
    cb(null, true);
};

function createUploader(subdirectory = 'items') {
    const destinationRoot = path.join(uploadRoot, subdirectory);
    ensureDirectory(destinationRoot);

    const storage = multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, destinationRoot),
        filename: (_req, file, cb) => {
            const ext = path.extname(file.originalname || '').toLowerCase();
            const safeExt = ext || '.jpg';
            cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`);
        }
    });

    return multer({
        storage,
        fileFilter,
        limits: {
            fileSize: 5 * 1024 * 1024
        }
    });
}

const upload = createUploader('items');

module.exports = upload;
module.exports.createUploader = createUploader;
