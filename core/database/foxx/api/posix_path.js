"use strict";

const path = require("path");

module.exports = (function () {
    let obj = {};

    /**
     * \brief will split a path string into components
     *
     * Example POSIX path
     * const posixPath = '/usr/local/bin/node';
     *
     * output: ['usr', 'local', 'bin', 'node']
     *
     **/
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
