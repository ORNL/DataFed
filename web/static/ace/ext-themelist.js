define("ace/ext/themelist", ["require", "exports", "module", "ace/lib/fixoldbrowsers"], function (
    e,
    t,
    n,
) {
    "use strict";
    e("ace/lib/fixoldbrowsers");
    var r = [["Light"], ["Dark", "dark"]];
    ((t.themesByName = {}),
        (t.themes = r.map(function (e) {
            var n = e[1] || e[0].replace(/ /g, "_").toLowerCase(),
                r = { caption: e[0], theme: "ace/theme/" + n, isDark: e[2] == "dark", name: n };
            return ((t.themesByName[n] = r), r);
        })));
});
(function () {
    window.require(["ace/ext/themelist"], function (m) {
        if (typeof module == "object" && typeof exports == "object" && module) {
            module.exports = m;
        }
    });
})();
