const Axios = require('axios');
const Promise = require('bluebird');
// const moment = require('moment');
const moment = require('moment-timezone');
var Firebase = require('firebase-admin');

/**
* @param context {WebtaskContext}
*/
module.exports = function(context, cb) {
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
  const settingsRef = db.ref('personal/_settings/toggl');

  const _togglApi = Axios.create({
    baseURL: 'https://toggl.com/api/v8',
    auth: {
      username: context.secrets.TOGGL_API_TOKEN,
      password: 'api_token',
    },
    responseType: 'json',
  });

  const _togglReportsApi = Axios.create({
    baseURL: 'https://toggl.com/reports/api/v2',
    auth: {
      username: context.secrets.TOGGL_API_TOKEN,
      password: 'api_token',
    },
    responseType: 'json',
  });

  var Api = {
    TogglApi: _togglApi,
    TogglReports: _togglReportsApi,
  };

  function getCurrentTimer() {
    // https://github.com/toggl/toggl_api_docs/blob/master/chapters/time_entries.md
    return Api.TogglApi.get('/time_entries/current');
  }

  function getTrackedTime(settings, since, until) {
    // https://github.com/toggl/toggl_api_docs/blob/master/reports/detailed.md
    return Api.TogglReports.get(
      '/details?user_agent=' +
        settings.userAgent +
        '&workspace_id=' +
        settings.workspaceId +
        '&since=' +
        since +
        '&until=' +
        until
    );
  }

  function getStats(settings, since, until) {
    return new Promise((resolve, reject) => {
      Promise.all([getCurrentTimer(), getTrackedTime(settings, since, until)])
        .then(([currentTimer, trackedTime]) => {
          let currentEntry = currentTimer.data.data;

          let _return = {
            lastModified: moment()
              .tz('Africa/Johannesburg')
              .format('DD/MM/YYYY HH:mm:ss'),
            timeEntries: trackedTime.data.data.map(entry => {
              return {
                id: entry.id,
                client: entry.client || '',
                description: entry.description || '',
                project: entry.project || '',
                projectColor: entry.project_hex_color || '',
                start: entry.start,
                end: entry.end,
                duration: entry.dur,
                tags: entry.tags || [],
              };
            }),
            currentTimer: {
              id: currentEntry.id,
              description: currentEntry.description,
              start: currentEntry.start,
              duration: currentEntry.duration,
              tags: currentEntry.tags || [],
            },
          };
          resolve(_return);
        })
        .catch(error => reject(error));
    });
  }

  // Get data from Firebase
  settingsRef.once('value').then(function(snapshot) {
    var _settings = snapshot.val();

    if (_settings) {
      let _today = moment.tz('Africa/Johannesburg').format('YYYY-MM-DD');
      const energyRef = db.ref('personal/data/' + _today + '/energy');

      getStats(_settings, _today, _today).then(
        data => {
          energyRef.set(data);
        },
        error => {
          // console.log(error);
          cb(null, {
            error: error,
          });
        }
      );

      cb(null, {
        msg: 'success',
      });
    }
  });
};
