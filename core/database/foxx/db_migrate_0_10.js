db._useDatabase("sdms");

db._query(
    "for i in alloc update i with { data_limit: i.max_size, data_size: i.tot_size, rec_limit: i.max_count, rec_count: i.tot_count } in alloc",
);
db._query(
    "for i in alloc update i with { max_count: null, max_size: null, tot_size: null, tot_count: null } in alloc options { keepNull:false }",
);
