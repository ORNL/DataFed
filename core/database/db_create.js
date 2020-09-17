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
graph._addVertexCollection("n");    // Annotations (notes)
graph._addVertexCollection("q");    // Saved queries
graph._addVertexCollection("repo"); // Repository servers
graph._addVertexCollection("task"); // Tasks
graph._addVertexCollection("tag"); // Tags


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

var note = graph_module._relation("note", ["d","c","n"], ["n"]);
graph._extendEdgeDefinitions(note);

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

//db._query("for doc in userview2 search analyzer(doc.name in tokens('Joe Samson','na2'), 'na2') let s = BM25(doc) filter s > 2 sort s desc return {id: doc._id,name:doc.name,score:s}");
//db._query("for doc in userview search analyzer(doc.name in tokens('x st','user_name'), 'user_name') let s = BM25(doc,1.2,.5) sort s desc return {id:doc._id,name:doc.name,score:s}");

var userview = db._createView("userview","arangosearch",{});
var analyzers = require("@arangodb/analyzers");

var user_name = analyzers.save("user_name","ngram",{
  "min": 3,
  "max": 5,
  "streamType":"utf8",
  "preserveOriginal":true
}, ["frequency","norm","position"]); 

userview.properties({
  links:{
    "u":{
      fields:{"name":{analyzers:["user_name"]}},
      includeAllFields: false
    }
  }
},true);

var tag_name = analyzers.save("tag_name","ngram",{
  "min": 3,
  "max": 5,
  "streamType":"utf8",
  "preserveOriginal":true
}, ["frequency","norm","position"]); 

var tagview = db._createView("tagview","arangosearch",{});

tagview.properties({
  links:{
    "tag":{
      fields:{"_key":{analyzers:["tag_name"]}},
      includeAllFields: false
    }
  }
},true);

var view = db._createView("textview","arangosearch",{});

view.properties({
    links: {
      "d": {
        fields:{
          "_id": { analyzers: ["identity"] },
          "title": { analyzers: ["text_en"] },
          "desc": { analyzers: ["text_en"] },
          "tags": { analyzers: ["identity"] }
        },
        includeAllFields: false
      }
    }
  },
  true
);

view = db._createView("collview","arangosearch",{});

view.properties({
    links: {
      "c": {
        fields: { 
          "title": { analyzers: ["text_en"] },
          "desc": { analyzers: ["text_en"] },
          "owner": { analyzers: ["identity"] },
          "ut": { analyzers: ["identity"] },
          "tags": { analyzers: ["identity"] },
          "public": { analyzers: ["identity"] }
        },
        includeAllFields: false
      }
    },
    primarySort:[
      {field:"title",direction:"asc"}
    ]
  },
  true
);

view = db._createView("projview","arangosearch",{});

view.properties({
    links: {
      "p": {
        fields: { "title":{analyzers:["text_en"]},"desc":{analyzers:["text_en"]}},
        includeAllFields: false
      }
    }
  },
  true
);

view = db._createView("topicview","arangosearch",{});

view.properties({
    links: {
      "t": {
        fields: {"title":{analyzers:["text_en"]}},
        includeAllFields: false
      }
    }
  },
  true
);

/*db.d.ensureIndex({ type: "fulltext", unique: false, fields: [ "keyw" ], sparse: true, minLength: 3 });
db.c.ensureIndex({ type: "fulltext", unique: false, fields: [ "topic" ], sparse: true, minLength: 3 });*/

db.task.ensureIndex({ type: "hash", unique: false, fields: [ "client" ], sparse: true });
db.task.ensureIndex({ type: "skiplist", unique: false, fields: [ "status" ], sparse: true });
db.task.ensureIndex({ type: "hash", unique: false, fields: [ "servers[*]" ], sparse: true });

/*db.d.ensureIndex({ type: "hash", unique: false, fields: [ "public" ], sparse: true });*/
db.d.ensureIndex({ type: "hash", unique: false, fields: [ "doi" ], sparse: true });
db.d.ensureIndex({ type: "persistent", unique: false, fields: [ "tags[*]" ] });

db.c.ensureIndex({ type: "persistent", unique: false, fields: [ "public" ], sparse: true });
db.c.ensureIndex({ type: "persistent", unique: false, fields: [ "tags[*]" ] });

db.u.ensureIndex({ type: "hash", unique: true, fields: [ "pub_key" ], sparse: true });
db.u.ensureIndex({ type: "hash", unique: true, fields: [ "access" ], sparse: true });
db.g.ensureIndex({ type: "hash", unique: true, fields: [ "uid", "gid" ] });
db.loc.ensureIndex({ type: "hash", unique: false, fields: [ "uid" ], sparse: true });
db.dep.ensureIndex({ type: "hash", unique: false, fields: [ "type" ], sparse: true });

db.tag.ensureIndex({ type: "persistent", unique: false, fields: [ "count" ], sparse: true });

db.t.ensureIndex({ type: "persistent", unique: false, fields: [ "top" ], sparse: true });
