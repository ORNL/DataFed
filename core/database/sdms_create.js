// Creates SDMS database schema for ArangoDB

db._createDatabase('sdms');
db._useDatabase('sdms');

var graph_module = require("@arangodb/general-graph");
var graph = graph_module._create("sdmsg");

graph._addVertexCollection("u");    // User
graph._addVertexCollection("accn");   // User facility accounts
graph._addVertexCollection("uuid");   // User globus UUIDs
graph._addVertexCollection("p");    // Project
graph._addVertexCollection("g");    // Group
graph._addVertexCollection("d");    // Data
graph._addVertexCollection("c");    // Collection
//graph._addVertexCollection("t");    // Tag
//graph._addVertexCollection("n");    // Note
graph._addVertexCollection("a");    // Alias
//graph._addVertexCollection("l");    // Label
graph._addVertexCollection("tr");   // Transfers
graph._addVertexCollection("repo"); // Repository servers


//var owner = graph_module._relation("owner", ["d","c","p","g","n","a"], ["u","p"]);
var owner = graph_module._relation("owner", ["d","c","p","g","a"], ["u","p"]);
graph._extendEdgeDefinitions(owner);

var mem = graph_module._relation("member", ["g"], ["u"]);
graph._extendEdgeDefinitions(mem);

var item = graph_module._relation("item", ["c"], ["d","c"]);
graph._extendEdgeDefinitions(item);

var acl = graph_module._relation("acl", ["d","c"], ["u","g"]);
graph._extendEdgeDefinitions(acl);

//var tag = graph_module._relation("tag", ["d","c"], ["t"]);
//graph._extendEdgeDefinitions(tag);

//var note = graph_module._relation("note", ["d","c"], ["n"]);
//graph._extendEdgeDefinitions(note);

var ident = graph_module._relation("ident", ["u"], ["accn","uuid"]);
graph._extendEdgeDefinitions(ident);

var adm = graph_module._relation("admin", ["p","repo"], ["u"]);
graph._extendEdgeDefinitions(adm);

var alias = graph_module._relation("alias", ["d","c"], ["a"]);
graph._extendEdgeDefinitions(alias);

var alloc = graph_module._relation("alloc", ["u","p"], ["repo"]);
graph._extendEdgeDefinitions(alloc);

var loc = graph_module._relation("loc", ["d"], ["repo"]);
graph._extendEdgeDefinitions(loc);

db.d.ensureIndex({ type: "hash", unique: false, fields: [ "public" ], sparse: true });

//db.accn.ensureIndex({ type: "hash", unique: true, fields: [ "pub_key" ] });
db.u.ensureIndex({ type: "hash", unique: true, fields: [ "pub_key" ], sparse: true });

//db.p.ensureIndex({ type: "hash", unique: true, fields: [ "domain", "title" ], sparse: true });

db.g.ensureIndex({ type: "hash", unique: true, fields: [ "uid", "gid" ] });

db.tr.ensureIndex({ type: "hash", unique: false, fields: [ "data_id" ] });
db.tr.ensureIndex({ type: "hash", unique: false, fields: [ "local_path" ] });
db.tr.ensureIndex({ type: "hash", unique: false, fields: [ "mode" ] });
db.tr.ensureIndex({ type: "hash", unique: false, fields: [ "status" ] });

//db.d.ensureIndex({ type: "fulltext", fields: [ "title" ], minLength: 3 })
//db.d.ensureIndex({ type: "fulltext", fields: [ "descr" ], minLength: 3 })

// Also has user, mode (read/write), status (globus)


db._truncate("u");
db._truncate("accn");
db._truncate("uuid");
db._truncate("g");
db._truncate("d");
db._truncate("c");
db._truncate("t");
db._truncate("n");
db._truncate("a");
db._truncate("l");
db._truncate("tr");
db._truncate("owner");
db._truncate("member");
db._truncate("item");
db._truncate("acl");
db._truncate("tag");
db._truncate("note");
db._truncate("ident");
db._truncate("admin");
db._truncate("alias");
