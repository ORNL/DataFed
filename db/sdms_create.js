// Creates SDMS database schema for ArangoDB

db._createDatabase('sdms');
db._useDatabase('sdms');

var graph_module = require("@arangodb/general-graph");
var graph = graph_module._create("sdmsg");

graph._addVertexCollection("user");
graph._addVertexCollection("cert");
graph._addVertexCollection("group");
graph._addVertexCollection("data");
graph._addVertexCollection("aliases");
graph._addVertexCollection("coll");
graph._addVertexCollection("tag");
graph._addVertexCollection("note");


var owner = graph_module._relation("owner", ["data","coll","group","note"], ["user"]);
graph._extendEdgeDefinitions(owner);

var mem = graph_module._relation("member", ["group"], ["user"]);
graph._extendEdgeDefinitions(mem);

var item = graph_module._relation("item", ["coll"], ["data","coll"]);
graph._extendEdgeDefinitions(item);

var acl = graph_module._relation("acl", ["data","coll"], ["user","group"]);
graph._extendEdgeDefinitions(acl);

var meta = graph_module._relation("meta", ["data","coll"], ["tag","note"]);
graph._extendEdgeDefinitions(meta);

var ident = graph_module._relation("ident", ["user"], ["cert"]);
graph._extendEdgeDefinitions(ident);

var alias = graph_module._relation("alias", ["data","coll"], ["aliases"]);
graph._extendEdgeDefinitions(alias);

db.cert.ensureIndex({ type: "hash", unique: true, fields: [ "subject" ] });
