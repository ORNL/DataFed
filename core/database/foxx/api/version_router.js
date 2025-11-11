'use strict';

const createRouter = require('@arangodb/foxx/router');
const router = createRouter();
const joi = require('joi');
const g_db = require('@arangodb').db;
const g_lib = require('./support');
const logger = require("./lib/logger");
const basePath = "";

module.exports = router;


//==================== ACL API FUNCTIONS


router.get('/version', function(req, res) {
        let client = null;
        try {
            client = req.queryParams.client;
            logger.logRequestStarted({
                client: client,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/version",
                status: "Started",
                description: "Get version numbers",
            });
            res.send({
                "release_year": 2025,
                "release_month": 10,
                "release_day": 7,
                "release_hour": 14,
                "release_minute": 1,
                "api_major": 1,
                "api_minor": 1,
                "api_patch": 0,
                "component_major": 1,
                "component_minor": 1,
                "component_patch": 0
            });
            logger.logRequestSuccess({
                client: client,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/version",
                status: "Success",
                description: "Get version numbers",
                extra: null
            });
        } catch (e) {
            logger.logRequestFailure({
                client: client,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/version",
                status: "Failure",
                description: "Get version numbers",
                extra: null,
                error: e
            });
            g_lib.handleException(e, res);
        }
    })
    .summary('Get version numbers')
    .description('Get version number of Foxx service, of foxx API and of release');
