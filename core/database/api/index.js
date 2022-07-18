'use strict';

require("@arangodb/aql/cache").properties({ mode: "demand" });

const   createRouter = require('@arangodb/foxx/router');
const   router = createRouter();

router.use( "/usr", require('./user_router') );
router.use( "/prj", require('./proj_router') );
router.use( "/grp", require('./group_router') );
router.use( "/dat", require('./data_router') );
router.use( "/col", require('./coll_router') );
router.use( "/acl", require('./acl_router') );
router.use( "/qry", require('./query_router') );
router.use( "/topic", require('./topic_router') );
router.use( "/tag", require('./tag_router') );
router.use( "/note", require('./note_router') );
router.use( "/authz", require('./authz_router') );
router.use( "/repo", require('./repo_router') );
router.use( "/task", require('./task_router') );
router.use( "/schema", require('./schema_router') );
router.use( "/config", require('./config_router') );
router.use( "/metrics", require('./metrics_router') );
router.use( "/admin", require('./admin_router') );

module.context.use(router);
