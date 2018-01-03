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


var owner = graph_module._relation("owner", ["d","c","g","n","a"], ["u"]);
graph._extendEdgeDefinitions(owner);

var mem = graph_module._relation("member", ["g"], ["u"]);
graph._extendEdgeDefinitions(mem);

var item = graph_module._relation("item", ["c"], ["d","c"]);
graph._extendEdgeDefinitions(item);

var acl = graph_module._relation("acl", ["d","c"], ["u","g"]);
graph._extendEdgeDefinitions(acl);

var meta = graph_module._relation("meta", ["d","c"], ["t","n"]);
graph._extendEdgeDefinitions(meta);

var ident = graph_module._relation("ident", ["u"], ["x"]);
graph._extendEdgeDefinitions(ident);

var adm = graph_module._relation("admin", ["u"], ["u"]);
graph._extendEdgeDefinitions(adm);

var alias = graph_module._relation("alias", ["d","c"], ["a"]);
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
