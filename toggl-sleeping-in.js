var TogglClient = require('toggl-api');

module.exports = function(context, cb) {
  var toggl = new TogglClient({ apiToken: context.secrets.API_TOKEN });

  toggl.getCurrentTimeEntry(function(err, timeEntry) {
    // handle error
    if (err) cb(null, { msg: 'error' });
    // Check if Sleep timer is running
    if (timeEntry.description === 'Sleep') {
      // Sleep timer is running
      toggl.startTimeEntry(
        {
          description: 'Sleeping in',
          pid: context.secrets.PROJECT_ID,
          billable: false,
          tags: ['#E'],
        },
        function(ex, data) {
          // handle error
          cb(null, { msg: 'error' });
        }
      );
      cb(null, { msg: 'Sleeping In timer started' });
    } else {
      cb(null, { msg: 'Sleep timer is not running' });
    }
  });
};
