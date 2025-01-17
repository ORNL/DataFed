"use strict";

const path = require("path");

module.exports = (function () {
    let obj = {};

    /**
     * Splits a POSIX path string into its components.
     *
     * @param {string} a_posix_path - The POSIX path to be split.
     *
     * @returns {string[]} An array of path components.
     *
     * @throws {Error} If the provided path is not a valid string.
     *
     * @example
     * // Input:
     * const posixPath = '/usr/local/bin/node';
     *
     * // Execution:
     * const splitPath = splitPOSIXPath(posixPath);
     * console.log(splitPath);
     *
     * // Output:
     * ['usr', 'local', 'bin', 'node']
     */
    obj.splitPOSIXPath = function (a_posix_path) {
        if (!a_posix_path) {
            throw new Error("Invalid POSIX path");
        } else if (typeof a_posix_path !== "string") {
            throw new Error(
                "Invalid POSIX path type: ",
                typeof a_posix_path,
                " path content: ",
                a_posix_path,
            );
        }
        // Split the path into components
        // components: ['', 'usr', 'local', 'bin', 'node']
        // The empty '' is for root
        const components = a_posix_path.split(path.posix.sep);

        // components: ['usr', 'local', 'bin', 'node']
        return components.filter((component) => component !== "");
    };

    return obj;
})();
