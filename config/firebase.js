const admin = require("firebase-admin");
const serviceAccount = require("./ttinglive-bot-firebase-adminsdk-fbsvc-4b31899b49.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

module.exports = db;