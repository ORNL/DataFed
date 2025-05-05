/*global describe, it, before, after */
'use strict';
const g_lib = require('../api/support');
const g_tasks = require('../api/tasks');
const g_db = require('@arangodb').db;
const assert = require('assert');

describe('Record Move Tests', () => {
  const user_id = "u/testuser";
  const client = {
    _id: user_id,
    is_admin: true
  };
  const proj_id = "p/test";
  const repo_id = "repo/test";
  const coll_id = "c/test";
  const data_id = "d/test";

  before(() => {
    // Create test project
    g_db.p.save({
      _key: "test",
      title: "Test Project",
      desc: "Test project for record move",
      owner: user_id,
      creator: user_id,
      ct: Math.floor(Date.now() / 1000),
      ut: Math.floor(Date.now() / 1000)
    });

    // Create test repo
    g_db.repo.save({
      _key: "test",
      title: "Test Repo",
      desc: "Test repository",
      path: "/test/repo/path",
      ct: Math.floor(Date.now() / 1000),
      ut: Math.floor(Date.now() / 1000)
    });

    // Create allocations
    g_tasks.taskInitAllocCreate(client, repo_id, user_id, 1000000, 100);
    g_tasks.taskInitAllocCreate(client, repo_id, proj_id, 1000000, 100);

    // Create test collection
    g_db.c.save({
      _key: "test",
      title: "Test Collection",
      desc: "Test collection",
      owner: user_id,
      creator: user_id,
      ct: Math.floor(Date.now() / 1000),
      ut: Math.floor(Date.now() / 1000)
    });

    // Create test data record
    g_db.d.save({
      _key: "test",
      title: "Test Data",
      desc: "Test data record",
      owner: user_id,
      creator: user_id,
      ct: Math.floor(Date.now() / 1000),
      ut: Math.floor(Date.now() / 1000)
    });

    // Create location for data record
    g_db.loc.save({
      _from: data_id,
      _to: repo_id,
      uid: user_id,
      source: "/test/data/path"
    });
  });

  after(() => {
    // Clean up test data
    try {
      g_db.p.remove("test");
      g_db.repo.remove("test");
      g_db.c.remove("test");
      g_db.d.remove("test");
      g_db.loc.removeByExample({_from: data_id});
      g_db.alloc.removeByExample({_from: user_id});
      g_db.alloc.removeByExample({_from: proj_id});
    } catch (e) {
      console.error("Cleanup error:", e);
    }
  });

  it('should successfully move a record between allocations', () => {
    // Create and run the record move task
    const result = g_tasks.taskInitRecOwnerChg(client, [data_id], coll_id, repo_id, false);
    console.log("Task created successfully:", result);

    // Run the task
    const task = result.task;
    let reply = g_tasks.taskRunRecOwnerChg(task);
    console.log("Task run reply:", reply);

    while (reply.cmd !== g_lib.TC_STOP) {
      task.step = reply.step;
      reply = g_tasks.taskRunRecOwnerChg(task);
      console.log("Task run reply:", reply);
    }

    // Verify the record was moved successfully
    const loc = g_db.loc.firstExample({_from: data_id});
    assert.equal(loc.uid, proj_id, "Record ownership should be changed to project");
  });
});