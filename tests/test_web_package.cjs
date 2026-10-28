"use strict";

// Run with: node --test tests/test_web_package.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { generate } = require("../scripts/generate_web_package.cjs");

const source = path.resolve(__dirname, "..");
const cmake = process.env.DATAFED_TEST_CMAKE || [
    "/opt/datafed/dependencies/bin/cmake", "/usr/bin/cmake",
].find(candidate => fs.existsSync(candidate));

function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "datafed-web-package-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    return root;
}

function write(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value));
}

function run(command, args, options = {}) {
    const result = spawnSync(command, args, { encoding: "utf8", ...options });
    assert.equal(result.status, 0, result.error?.message || result.stdout + result.stderr);
    return result;
}

test("the checked-in application template declares no dependencies", t => {
    const root = fixture(t);
    const canonicalFile = path.join(source, "external/DataFedDependencies/web/package.json");
    const canonical = JSON.parse(fs.readFileSync(canonicalFile));
    const output = path.join(root, "package.json");
    generate(fs.readFileSync(path.join(source, "web/package.json.in"), "utf8"), canonicalFile, output);
    const manifest = JSON.parse(fs.readFileSync(output));
    for (const field of ["dependencies", "devDependencies", "overrides"]) {
        assert.deepEqual(manifest[field], canonical[field]);
    }
    assert.equal(manifest.type, "module");
    assert.equal(manifest.scripts.test, "mocha test/**/*.test.js");
    assert.equal(manifest.private, undefined); // Dependency-image metadata is not merged.
});

test("dependency declarations in application metadata fail without replacing a good manifest", t => {
    const root = fixture(t);
    const canonical = path.join(root, "dependencies.json");
    const output = path.join(root, "package.json");
    write(canonical, { dependencies: { example: "1.0.0" } });
    write(output, "last good manifest");
    for (const field of ["dependencies", "devDependencies", "overrides", "optionalDependencies",
        "peerDependencies", "peerDependenciesMeta", "bundledDependencies", "bundleDependencies"]) {
        assert.throws(() => generate(JSON.stringify({ [field]: {} }), canonical, output), /must not declare/);
        assert.equal(fs.readFileSync(output, "utf8"), "last good manifest");
    }
});

test("missing or malformed dependency inputs fail closed", t => {
    const root = fixture(t);
    const canonical = path.join(root, "dependencies.json");
    const output = path.join(root, "package.json");
    write(output, "last good manifest");
    assert.throws(() => generate("{}", canonical, output), /ENOENT/);
    for (const content of ["{", "null", "[]", "{}", '{"dependencies":[]}',
        '{"dependencies":{},"overrides":true}', '{"dependencies":{},"devDependencies":null}']) {
        write(canonical, content);
        assert.throws(() => generate("{}", canonical, output));
        assert.equal(fs.readFileSync(output, "utf8"), "last good manifest");
    }
    const result = spawnSync(process.execPath,
        [path.join(source, "scripts/generate_web_package.cjs"), "{}", canonical, output], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Web package generation failed/);
});

function cmakeFixture(root) {
    for (const file of ["cmake/Web.cmake", "scripts/generate_web_package.cjs", "web/package.json.in",
        "external/DataFedDependencies/web/package.json",
        "external/DataFedDependencies/web/zeromq-compat/package.json",
        "external/DataFedDependencies/web/zeromq-compat/index.cjs"]) {
        write(path.join(root, file), fs.readFileSync(path.join(source, file), "utf8"));
    }
    write(path.join(root, "cmake/Version.cmake"),
        "set(DATAFED_WEB_MAJOR 7)\nset(DATAFED_WEB_MINOR 8)\nset(DATAFED_WEB_PATCH 9)\n");
    write(path.join(root, "web/version.js.in"), 'export default "@DATAFED_WEB_MAJOR@";\n');
    write(path.join(root, "CMakeLists.txt"),
        'cmake_minimum_required(VERSION 3.17)\nproject(WebManifest LANGUAGES NONE)\ninclude(cmake/Web.cmake)\n');
}

function markEdit(file, build) {
    // Some test filesystems batch writes under one timestamp. Model an edit
    // after configuration so CMake's normal timestamp checks can observe it.
    const timestamp = new Date(fs.statSync(path.join(build, "Makefile")).mtimeMs + 1000);
    fs.utimesSync(file, timestamp, timestamp);
}

test("CMake expands the version and automatically regenerates after either manifest changes", { skip: !cmake }, t => {
    const root = fixture(t);
    cmakeFixture(root);
    const build = path.join(root, "build");
    run(cmake, ["-S", root, "-B", build, "-G", "Unix Makefiles", `-DDATAFED_WEB_NODE_EXECUTABLE=${process.execPath}`]);
    const output = path.join(root, "web/package.json");
    assert.equal(JSON.parse(fs.readFileSync(output)).version, "7.8.9");
    assert.ok(fs.existsSync(path.join(root, "web/zeromq-compat/index.cjs")));

    const canonicalFile = path.join(root, "external/DataFedDependencies/web/package.json");
    const canonical = JSON.parse(fs.readFileSync(canonicalFile));
    canonical.overrides["example-package"] = "1.2.3";
    write(canonicalFile, canonical);
    markEdit(canonicalFile, build);
    run(cmake, ["--build", build]);
    assert.equal(JSON.parse(fs.readFileSync(output)).overrides["example-package"], "1.2.3");
    const earlier = new Date(fs.statSync(path.join(build, "Makefile")).mtimeMs - 1000);
    fs.utimesSync(canonicalFile, earlier, earlier);

    const metadataFile = path.join(root, "web/package.json.in");
    const metadata = JSON.parse(fs.readFileSync(metadataFile));
    metadata.description = "Updated application metadata";
    write(metadataFile, metadata);
    markEdit(metadataFile, build);
    run(cmake, ["--build", build]);
    assert.equal(JSON.parse(fs.readFileSync(output)).description, metadata.description);

    metadata.dependencies = {};
    write(metadataFile, metadata);
    markEdit(metadataFile, build);
    const result = spawnSync(cmake, ["--build", build], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /must not declare dependencies/);
});

test("standalone CMake reports a missing canonical manifest", { skip: !cmake }, t => {
    const root = fixture(t);
    cmakeFixture(root);
    const command = [`-DDATAFED_WEB_NODE_EXECUTABLE=${process.execPath}`, "-P", path.join(root, "cmake/Web.cmake")];
    run(cmake, command, { cwd: root });
    fs.unlinkSync(path.join(root, "external/DataFedDependencies/web/package.json"));
    const result = spawnSync(cmake, command, { encoding: "utf8", cwd: root });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Missing web dependency manifest/);
});

test("bare-metal installation copies the local adapter before npm runs", { skip: !cmake }, t => {
    const root = fixture(t);
    cmakeFixture(root);
    run(cmake, [`-DDATAFED_WEB_NODE_EXECUTABLE=${process.execPath}`, "-P", path.join(root, "cmake/Web.cmake")]);
    const install = path.join(root, "installed");
    write(path.join(root, "scripts/install_ws.sh"), fs.readFileSync(path.join(source, "scripts/install_ws.sh"), "utf8"));
    write(path.join(root, "config/datafed.sh"),
        `DATAFED_INSTALL_PATH='${install}'\nDATAFED_DEFAULT_LOG_PATH='${root}/logs'\n`);
    write(path.join(root, "external/DataFedDependencies/scripts/dependency_versions.sh"), "");
    write(path.join(root, "external/DataFedDependencies/scripts/dependency_install_functions.sh"),
        "install_nvm() { :; }\ninstall_node() { :; }\ninstall_foxx_cli() { :; }\n");
    write(path.join(root, "web/datafed-ws.js"), "// fixture\n");
    write(path.join(root, "config/datafed-ws.cfg"), "# fixture\n");
    write(path.join(install, "keys/datafed-core-key.pub"), "fixture");
    fs.mkdirSync(path.join(install, "web/static"), { recursive: true });
    fs.mkdirSync(path.join(root, "web/static"));
    const npm = path.join(root, "bin/npm");
    write(npm, `#!/bin/bash\nset -e\ntest -f '${install}/web/zeromq-compat/package.json'\ntest -f '${install}/web/zeromq-compat/index.cjs'\ntouch '${root}/npm-called'\n`);
    fs.chmodSync(npm, 0o755);
    const options = { env: { ...process.env, PATH: path.dirname(npm) + path.delimiter + process.env.PATH } };
    run("bash", [path.join(root, "scripts/install_ws.sh")], options);
    assert.ok(fs.existsSync(path.join(root, "npm-called")));
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(install, "web/package.json"))),
        JSON.parse(fs.readFileSync(path.join(root, "web/package.json"))));

    fs.unlinkSync(path.join(root, "web/package.json"));
    fs.unlinkSync(path.join(root, "npm-called"));
    const result = spawnSync("bash", [path.join(root, "scripts/install_ws.sh")], { encoding: "utf8", ...options });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Configure the web build with CMake/);
    assert.ok(!fs.existsSync(path.join(root, "npm-called")));
});
