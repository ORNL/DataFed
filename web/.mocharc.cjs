/**
 * Mocha configuration file.
 *
 * This configuration file sets up various options for running Mocha tests.
 *
 * @property {boolean} diff - Show diff on failure.
 * @property {boolean} recursive - Include subdirectories.
 * @property {boolean} exit - Force Mocha to quit after tests complete.
 * @property {string[]} extension - File extensions to include.
 * @property {string} package - Path to the package.json file.
 * @property {string} reporter - Reporter to use.
 * @property {number} timeout - Test-case timeout in milliseconds.
 * @property {string} ui - User interface to use (e.g., BDD, TDD).
 * @property {string[]} require - Modules to require before running tests.
 * @property {string[]} watch-files - Files to watch for changes.
 * @property {string[]} watch-ignore - Files to ignore when watching.
 * @property {string[]} spec - Test files to run.
 */
module.exports = {
    diff: true,
    recursive: true,
    exit: true,
    loader: "mock-import/register",
    extension: ["js"],
    package: "./package.json",
    reporter: "spec",
    timeout: 2000,
    ui: "bdd",
    require: ["test/setup.js"],
    "watch-files": ["test/**/*.js", "static/**/*.js"],
    "watch-ignore": ["node_modules", "coverage"],
    spec: ["test/**/*.test.js"],
};
