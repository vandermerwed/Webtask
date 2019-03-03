const moment = require('moment');
var Firebase = require('firebase-admin');

/**
* @param context {WebtaskContext}
*/
module.exports = async function(context) {
  if (!context.body) return new Error('Request body cannot be null');

  if (!Firebase.apps.length) {
    Firebase.initializeApp({
      credential: Firebase.credential.cert({
        projectId: context.secrets.FIREBASE_PROJECT_ID,
        clientEmail: context.secrets.FIREBASE_CLIENT_EMAIL,
        privateKey: context.secrets.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
      databaseURL: context.secrets.FIREBASE_DATABASE_URL,
    });
  }
  const db = Firebase.database();

  let _todayPath = moment.utc().format('YYYY-MM-DD');
  const sleepRef = db.ref('personal/data/' + _todayPath + '/sleep');

  // Write sleep data
  sleepRef.set(context.body);

  return { data: context.body || '{ error: "no data"}' };
};
