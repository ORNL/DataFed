'use strict';

const   createRouter = require('@arangodb/foxx/router');
const   router = createRouter();
const   joi = require('joi');
const   g_db = require('@arangodb').db;
const   g_lib = require('./support');

module.exports = router;


//==================== ACL API FUNCTIONS


router.get('/version', function (req, res) {
    try {
        res.send({
          "release_year": 2023,
          "release_month": 4,
          "release_day": 18,
          "release_hour": 16,
          "release_minute": 30,
          "api_major": 0,
          "api_minor": 0,
          "api_patch": 0,
          "component_major": 0,
          "component_minor": 0,
          "component_patch": 0
        });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.summary('Get version numbers')
.description('Get version number of Foxx service, of foxx API and of release');
