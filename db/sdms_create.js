// Creates SDMS database schema for ArangoDB

db._createDatabase('sdms');
db._useDatabase('sdms');

var graph_module = require("@arangodb/general-graph");
var graph = graph_module._create("sdmsg");

graph._addVertexCollection("u");    // User
graph._addVertexCollection("x");    // X.509 cert
graph._addVertexCollection("g");    // Group
graph._addVertexCollection("d");    // Data
graph._addVertexCollection("c");    // Collection
graph._addVertexCollection("t");    // Tag
graph._addVertexCollection("n");    // Note
graph._addVertexCollection("a");    // Alias


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

var adm = graph_module._relation("admin", ["user"], ["user"]);
graph._extendEdgeDefinitions(adm);

var alias = graph_module._relation("alias", ["data","coll"], ["aliases"]);
graph._extendEdgeDefinitions(alias);

db.x.ensureIndex({ type: "hash", unique: true, fields: [ "subject" ] });




db._truncate("u");
db._truncate("x");
db._truncate("g");
db._truncate("d");
db._truncate("a");
db._truncate("c");
db._truncate("t");
db._truncate("n");
db._truncate("owner");
db._truncate("member");
db._truncate("item");
db._truncate("acl");
db._truncate("meta");
db._truncate("ident");
db._truncate("admin");
db._truncate("alias");
