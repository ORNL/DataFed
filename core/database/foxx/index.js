"use strict";

require("@arangodb/aql/cache").properties({
    mode: "demand",
});

const createRouter = require("@arangodb/foxx/router");
const router = createRouter();

router.use("/usr", require("./api/user_router"));
router.use("/prj", require("./api/proj_router"));
router.use("/grp", require("./api/group_router"));
router.use("/dat", require("./api/data_router"));
router.use("/col", require("./api/coll_router"));
router.use("/acl", require("./api/acl_router"));
router.use("/qry", require("./api/query_router"));
router.use("/topic", require("./api/topic_router"));
router.use("/tag", require("./api/tag_router"));
router.use("/note", require("./api/note_router"));
router.use("/authz", require("./api/authz_router"));
router.use("/repo", require("./api/repo_router"));
router.use("/task", require("./api/task_router"));
router.use("/schema", require("./api/schema_router"));
router.use("/config", require("./api/config_router"));
router.use("/metrics", require("./api/metrics_router"));
router.use("/admin", require("./api/admin_router"));
router.use("/", require("./api/version_router"));

module.context.use(router);
