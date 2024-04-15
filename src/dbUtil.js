const path = require('path');
const Datastore = require("@seald-io/nedb");

const connectMap = {};
function getCollection(collectionName) {
    if (connectMap.hasOwnProperty(collectionName)) {
        return connectMap[collectionName];
    }
    const db = new Datastore({
        filename: path.join(__dirname, '../../database', collectionName),
        autoload: true
    });
    connectMap[collectionName] = db;
    return db;
}

module.exports = {
    getCollection,
}
