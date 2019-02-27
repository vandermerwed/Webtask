const Axios = require('axios');
const Promise = require('bluebird');
const moment = require('moment');
var Firebase = require('firebase-admin');

/**
 * @param context {WebtaskContext}
 * @description Calls various services and updates a Firebase Realtime Datastore with aggrgate data
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
  const projectsRef = db.ref('projects');

  // --- TODOIST AXIOS SETUP ---
  const _todoistApiV7 = Axios.create({
    baseURL: 'https://todoist.com/api/v7',
    headers: { Authorization: 'Bearer ' + context.secrets.TODOIST_API_TOKEN },
    responseType: 'json',
  });

  const _todoistApiV8 = Axios.create({
    baseURL: 'https://beta.todoist.com/API/v8',
    headers: { Authorization: 'Bearer ' + context.secrets.TODOIST_API_TOKEN },
    responseType: 'json',
  });
  // --- END TODOIST AXIOS SETUP ---

  // --- TOGGL API SETUP ---
  const _togglApi = Axios.create({
    baseURL: 'https://toggl.com/reports/api/v2',
    auth: {
      username: context.secrets.TOGGL_API_TOKEN,
      password: 'api_token',
    },
    responseType: 'json',
  });
  // --- END TOGGL API SETUP ---
  // --- GITHUB API SETUP ---
  const _githubApi = Axios.create({
    baseURL: 'https://api.github.com/graphql',
    auth: {
      username: 'token',
      password: context.secrets.GITHUB_API_TOKEN,
    },
    responseType: 'json',
  });
  // --- END GITHUB API SETUP ---

  var Api = {
    Todoist: {
      v7: _todoistApiV7,
      v8: _todoistApiV8,
    },
    Toggl: _togglApi,
    Github: _githubApi,
  };

  function getActiveTasks(projectId) {
    return Api.Todoist.v8.get('/tasks?project_id=' + projectId);
  }

  function getCompletedTasks(projectId) {
    return Api.Todoist.v7.get('/completed/get_all?project_id=' + projectId);
  }

  function getTrackedTime(settings) {
    return Api.Toggl.get(
      '/project?user_agent=' +
        settings.userAgent +
        '&workspace_id=' +
        settings.workspaceId +
        '&project_id=' +
        settings.projectId
    );
  }

  function getCommits(settings) {
    return Api.Github.post('', {
      query: `{
                repository(owner: "${settings.username}", name: "${settings.repo}") {
                  ref(qualifiedName: "master"){
                    target{
                      ... on Commit{
                        history{
                          totalCount
                        }
                      }
                    }
                  }
                }
              }`,
    });
  }

  function getStats(projectData, settings) {
    return new Promise((resolve, reject) => {
      Promise.all([
        getActiveTasks(settings.todoist.projectId),
        getCompletedTasks(settings.todoist.projectId),
        getTrackedTime(settings.toggl),
        getCommits(settings.github),
      ])
        .then(([active, completed, trackedTime, commits]) => {
          // tally counts and build return object
          let _activeTasks =
            active && active.data
              ? active.data.filter(function(item) {
                  // filter out completed and heading tasks
                  return (
                    !item.completed &&
                    !item.content.endsWith(':') &&
                    !item.content.startsWith('*')
                  );
                })
              : [];

          let _return = {
            lastModified: moment.utc().format('DD/MM/YYYY HH:mm:ss'),
            status: projectData.status,
            tasks: {
              open: _activeTasks ? _activeTasks.length : 0,
              completed:
                completed && completed.data ? completed.data.items.length : 0,
              // openData: active.data,
              // completedData: completed.data,
              todoist: settings.todoist, // set settings again
            },
            time: {
              total:
                trackedTime && trackedTime.data
                  ? Math.round(
                      moment.duration(trackedTime.data.duration).asHours()
                    )
                  : 0,
              // data: trackedTime.data,
              toggl: settings.toggl, // set settings again
            },
            code: {
              commitCount:
                commits.data &&
                commits.data.data.repository &&
                commits.data.data.repository.ref
                  ? commits.data.data.repository.ref.target.history.totalCount
                  : 0,
              //data: commits.data,
              github: settings.github, // set settings again
            },
          };
          // console.log(_return);
          resolve(_return);
          // return _return;
        })
        .catch(
          error => reject(error)
          // console.error(error)
        );
    });
  }

  // Get data from Firebase
  projectsRef.once('value').then(function(snapshot) {
    var activeProjects = snapshot.val();

    if (activeProjects) {
      // projectsRef.push(context.body);
      // console.log(activeProjects);
      // let updates = {};
      for (var project in activeProjects) {
        let settings = {
          todoist: activeProjects[project].tasks.todoist,
          toggl: activeProjects[project].time.toggl,
          github: activeProjects[project].code.github,
        };

        let projectRef = projectsRef.child(project);

        getStats(activeProjects[project], settings).then(
          data => {
            projectRef.set(data);
          },
          error => {
            console.log(error);
          }
        );
      }
      cb(null, {
        msg: 'success',
      });
    }
  });
};
