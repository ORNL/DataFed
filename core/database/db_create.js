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
graph._addVertexCollection("t");    // Topic
graph._addVertexCollection("a");    // Alias
graph._addVertexCollection("q");    // Saved queries
graph._addVertexCollection("repo"); // Repository servers
graph._addVertexCollection("task"); // Tasks


var owner = graph_module._relation("owner", ["d","c","p","g","a","q","task"], ["u","p"]);
graph._extendEdgeDefinitions(owner);

var mem = graph_module._relation("member", ["g"], ["u"]);
graph._extendEdgeDefinitions(mem);

var item = graph_module._relation("item", ["c"], ["d","c"]);
graph._extendEdgeDefinitions(item);

var acl = graph_module._relation("acl", ["d","c"], ["u","g"]);
graph._extendEdgeDefinitions(acl);

var topic = graph_module._relation("top", ["d","t"], ["t"]);
graph._extendEdgeDefinitions(topic);

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

var dep = graph_module._relation("dep", ["d"], ["d"]);
graph._extendEdgeDefinitions(dep);

var lock = graph_module._relation("lock", ["task"], ["d","c","p","u","repo"]);
graph._extendEdgeDefinitions(lock);

var block = graph_module._relation("block", ["task"], ["task"]);
graph._extendEdgeDefinitions(block);

var view = db._createView("textview","arangosearch",{});

view.properties({
    links: {
      "d": {
        fields: { "title":{analyzers:["text_en"]},"desc":{analyzers:["text_en"]},"keyw":{analyzers:["text_en"]}},
        includeAllFields: false
      }
    }
  },
  true
);

view = db._createView("projview","arangosearch",{});

view.properties({
    links: {
      "p": {
        fields: { "title":{analyzers:["text_en"]},"desc":{analyzers:["text_en"]},"keyw":{analyzers:["text_en"]}},
        includeAllFields: false
      }
    }
  },
  true
);

db.task.ensureIndex({ type: "hash", unique: false, fields: [ "client" ], sparse: true });
db.task.ensureIndex({ type: "skiplist", unique: false, fields: [ "status" ], sparse: true });
db.task.ensureIndex({ type: "hash", unique: false, fields: [ "servers[*]" ], sparse: true });
db.d.ensureIndex({ type: "hash", unique: false, fields: [ "public" ], sparse: true });
db.d.ensureIndex({ type: "hash", unique: false, fields: [ "doi" ], sparse: true });
db.u.ensureIndex({ type: "hash", unique: true, fields: [ "pub_key" ], sparse: true });
db.u.ensureIndex({ type: "hash", unique: true, fields: [ "access" ], sparse: true });
db.g.ensureIndex({ type: "hash", unique: true, fields: [ "uid", "gid" ] });
db.loc.ensureIndex({ type: "hash", unique: false, fields: [ "uid" ], sparse: true });
db.dep.ensureIndex({ type: "hash", unique: false, fields: [ "type" ], sparse: true });

