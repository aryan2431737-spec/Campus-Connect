const { initializeDatabase, databasePath } = require('../data/store');

function connectDB() {
    initializeDatabase();
    console.log(`SQLITE Connected: ${databasePath}`);
}

module.exports = connectDB;
