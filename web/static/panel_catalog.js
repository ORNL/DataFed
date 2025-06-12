import * as util from "./util.js";
import * as api from "./api.js";
import * as model from "./model.js";
import * as settings from "./settings.js";
import * as panel_info from "./panel_item_info.js";
import * as panel_search from "./panel_search.js";

export function newCatalogPanel(a_id, a_frame, a_parent) {
    return new CatalogPanel(a_id, a_frame, a_parent);
}

function CatalogPanel(a_id, a_frame, a_parent) {
    $("#cat_coll_tree", a_frame).fancytree({
        toggleEffect: false,
        extensions: ["themeroller"],
        themeroller: {
            activeClass: "my-fancytree-active",
            hoverClass: "",
        },
        source: [],
        nodata: false,
        selectMode: 2,
        activate: function (event, data) {
            if (keyNav) {
                cat_tree.selectAll(false);
                data.node.setSelected(true);
                keyNav = false;
            }

            panel_info.showSelectedInfo(data.node, a_parent.checkTreeUpdate);
        },
        select: function (event, data) {
            if (data.node.isSelected()) {
                data.node.visit(function (node) {
                    node.setSelected(false);
                });
                var parents = data.node.getParentList();
                for (var i in parents) {
                    parents[i].setSelected(false);
                }
            }

            a_parent.updateBtnState();
        },
        collapse: function (event, data) {
            if (data.node.isLazy()) {
                data.node.resetLazy();
            }
        },
        renderNode: function (ev, data) {
            if (data.node.data.hasBtn) {
                $(".btn", data.node.li).button();
            }
        },
        click: function (event, data) {
            if (data.targetType == "icon" && data.node.isFolder()) {
                data.node.toggleExpanded();
            } else if (!search_sel_mode) {
                if (
                    data.originalEvent.shiftKey &&
                    (data.originalEvent.ctrlKey || data.originalEvent.metaKey)
                ) {
                    util.treeSelectRange(cat_tree, data.node);
                } else if (data.originalEvent.ctrlKey || data.originalEvent.metaKey) {
                    if (data.node.isSelected()) {
                        data.node.setSelected(false);
                    } else {
                        data.node.setSelected(true);
                    }
                } else if (data.originalEvent.shiftKey) {
                    cat_tree.selectAll(false);
                    util.treeSelectRange(cat_tree, data.node);
                } else {
                    cat_tree.selectAll(false);
                    data.node.setSelected(true);
                }
            }
        },
        keydown: function (ev, data) {
            if (ev.keyCode == 38 || ev.keyCode == 40) {
                keyNav = true;
            }
        },
        lazyLoad: function (event, data) {
            if (data.node.key.startsWith("t/")) {
                data.result = {
                    url: api.topicList_url(
                        data.node.key,
                        data.node.data.offset,
                        settings.opts.page_sz,
                    ),
                    cache: false,
                };
            } else if (data.node.key.startsWith("c/")) {
                data.result = {
                    url: api.collRead_url(
                        data.node.key,
                        data.node.data.offset,
                        settings.opts.page_sz,
                    ),
                    cache: false,
                };
            }
        },
        postProcess: function (event, data) {
            if (data.node.parent) {
                data.result = [];
                var item, entry;
                var items = data.response.item;
                var scope = data.node.data.scope;

                util.addTreePagingNode(data);

                for (var i in items) {
                    item = items[i];
                    if (item.id[0] == "c") {
                        entry = {
                            title: util.generateTitle(item),
                            folder: true,
                            lazy: true,
                            key: item.id,
                            offset: 0,
                            scope: item.owner ? item.owner : scope,
                        };
                    } else {
                        // data records
                        entry = {
                            title: util.generateTitle(item),
                            key: item.id,
                            icon: util.getDataIcon(item),
                            checkbox: false,
                            doi: item.doi,
                            scope: item.owner ? item.owner : scope,
                            size: item.size,
                        };
                    }

                    data.result.push(entry);
                }

                if (data.result && data.result.length == 0) {
                    data.result.push({
                        title: "(empty)",
                        icon: false,
                        checkbox: false,
                        nodrag: true,
                    });
                }
            } else {
                data.result = data.response;
            }
        },
    });

    var cat_panel = $(".cat-panel"),
        cur_topic_div = $("#cat_cur_topic", cat_panel),
        cur_topic = [],
        back_btn = $(".btn-cat-back", cat_panel),
        top_res_div = $("#cat_topic_result_div", cat_panel),
        cat_coll_div = $("#cat_coll_div", cat_panel),
        topics_panel = $(".topics-div", cat_panel),
        topics_div = $("#cat_topics_div", cat_panel),
        cur_items = {},
        cur_sel = null,
        cat_tree_div = $("#cat_coll_tree", cat_panel),
        cat_tree = $.ui.fancytree.getTree("#cat_coll_tree", cat_panel),
        keyNav = false,
        search_sel_mode = false,
        topic_tags = [],
        user_tags = [],
        tags_div = $("#cat_tags_div", cat_panel),
        topic_search_path = {},
        loading = 0,
        cur_mode = model.SM_COLLECTION,
        coll_off = 0;

    const icon_open = "ui-icon-play";

    $(".btn", cat_panel).button();

    this.init = function () {
        top_res_div.html("(loading...)");
        loadTopics();
        loadCollections();
    };

    this.getSelectedNodes = function () {
        if (cat_tree_div.is(":visible")) {
            return cat_tree.getSelectedNodes();
        } else if (cur_sel) {
            return [{ key: cur_sel, data: cur_items[cur_sel] }];
        } else {
            return [];
        }
    };

    this.getActiveNode = function () {
        if (cat_tree_div.is(":visible")) return cat_tree.activeNode;
        else if (cur_sel) {
            return { key: cur_sel, data: cur_items[cur_sel] };
        } else {
            return null;
        }
    };

    function setTopicPath() {
        var topic;

        if (cur_topic.length) {
            topic = "";
            for (var i in cur_topic) {
                if (topic.length) {
                    if (cur_topic[i].id.charAt(0) == "t") topic += ".";
                    else topic += " - ";
                }
                topic += cur_topic[i].title;
            }
        } else {
            topic = "Home";
        }

        cur_topic_div.text(topic);
    }

    function updateTopicNav() {
        if (!loading) {
            $(".btn-cat-home,.cat-topic-result", cat_panel).button("enable");
            back_btn.button(cur_topic.length ? "enable" : "disable");
            $(".cat-topic-div", topics_div).removeClass("ui-button-disabled ui-state-disabled");
            $(".btn", topics_div).button("enable");
            panel_info.showSelectedInfo();
        }
    }

    function loadTopics(a_topic_id, a_cb) {
        topics_div.html("Loading...");
        $(".btn-cat-home,.btn-cat-back,.cat-topic-result", cat_panel).button("disable");
        loading |= 1;

        api.topicListTopics(a_topic_id, null, null, function (ok, data) {
            loading &= 2;

            if (ok) {
                setTopics(data);
            }

            updateTopicNav();

            if (a_cb) a_cb(ok);
        });
    }

    function onTopicClick(ev) {
        if (loading) return;

        var topic = $(this).closest(".cat-topic"),
            name = topic.attr("data");

        cur_topic.push({ title: name, id: topic[0].id });
        setTopicPath();

        loadTopics(topic[0].id);

        topic_tags.push(name);

        coll_off = 0;
        loadCollections();

        ev.stopPropagation();
    }

    function onTopicActivate(ev) {
        var el = $(this);

        $(".cat-topic-div", topics_div).removeClass("ui-state-active");
        $(".cat-topic-div", el).addClass("ui-state-active");

        panel_info.showSelectedInfo(el[0].id);
        a_parent.updateBtnState();

        ev.stopPropagation();
    }

    function onSearchTopicClick(ev) {
        var topic_id = $(this)[0].id;

        if (cat_tree_div.is(":visible")) {
            closeCollTree();
        } else {
            cur_sel = null;
            a_parent.updateBtnState();
        }

        if (topic_id in topic_search_path) {
            cur_topic = topic_search_path[topic_id];
        } else {
            cur_topic = [];
        }

        topic_tags = [];
        for (var i in cur_topic) topic_tags.push(cur_topic[i].title);

        setTopicPath();

        loadTopics(topic_id);

        coll_off = 0;
        loadCollections();
    }

    function onCollectionActivate(ev) {
        var el = $(this),
            coll = el[0],
            id = coll.id.charAt(0) + "/" + coll.id.substr(2);

        $(".cat-coll-title-div,.cat-item-title", cat_coll_div).removeClass("ui-state-active");
        $(".cat-coll-title-div", el).addClass("ui-state-active");

        panel_info.showSelectedInfo(id);
        cur_sel = id;
        a_parent.updateBtnState();

        ev.stopPropagation();
    }

    function openCollTree(a_coll_id) {
        if (cur_mode != model.SM_COLLECTION) return;

        var coll = cur_items[a_coll_id];

        cat_coll_div.empty();
        cat_coll_div.hide();
        topics_panel.hide();

        cat_tree
            .reload([
                {
                    title: util.generateTitle(coll),
                    key: a_coll_id,
                    scope: coll.owner,
                    folder: true,
                    lazy: true,
                    selected: true,
                    offset: 0,
                },
            ])
            .done(function () {
                cat_tree.rootNode.children[0].setExpanded();
            });

        cat_tree_div.show();
        a_parent.updateBtnState();
    }

    function closeCollTree() {
        cat_tree_div.hide();
        cur_sel = null;
        cat_tree.reload([]);
        cat_coll_div.show();
        topics_panel.show();
        a_parent.updateBtnState();
    }

    function onCollectionOpen(ev) {
        var el = $(this),
            coll = el.closest(".cat-coll"),
            id = coll[0].id;

        id = id.charAt(0) + "/" + id.substr(2);

        cur_topic.push({ title: $(".cat-coll-title", coll).text(), id: id });
        setTopicPath();
        back_btn.button("enable");

        openCollTree(id);

        ev.stopPropagation();
    }

    function setTopics(data) {
        var html = "";
        if (data.topic && data.topic.length) {
            var topic, title;
            for (var i in data.topic) {
                topic = data.topic[i];
                //ui-button cat-topic
                title = util.escapeHTML(topic.title);
                html +=
                    "<div class='cat-topic' id='" +
                    topic.id +
                    "' data='" +
                    title +
                    "'>\
                    <div class='cat-topic-div ui-button ui-corner-all" +
                    (loading ? " ui-button-disabled ui-state-disabled" : "") +
                    "' style='display:block;text-align:left'>\
                        <div class='row-flex'>\
                            <div style='flex:1 1 none;padding-top:2px'>" +
                    title.charAt(0).toUpperCase() +
                    title.substr(1) +
                    "</div>\
                            <div style='flex:1 1 auto'><div class='cat-topic-cnt'>" +
                    util.countToString(topic.collCnt) +
                    "</div></div>\
                            <div class='cat-topic-btn-div' style='flex:none'><button class='btn btn-icon btn-cat-topic-open'" +
                    (loading ? "disabled" : "") +
                    "><span class='ui-icon ui-icon-play'></span></button></div>\
                        </div>\
                    </div>\
                </div>";
            }
        } else {
            html = "<div class='cat-topic-empty'>No sub-categories</div>";
        }

        topics_div.html(html);
        $(".btn", topics_div).button();
    }

    function setSearchTopics(data) {
        var html = "";
        if (data.topic && data.topic.length) {
            var topic, title;
            topic_search_path = {};
            for (var i in data.topic) {
                topic = data.topic[i];
                topic_search_path[topic.id] = topic.path;
                title = util.escapeHTML(topic.title);
                //html += "<div class='cat-topic-result ui-button ui-corner-all' id='" + topic.id + "'>" + topic.title + "</div>";
                html +=
                    "<button class='cat-topic-result btn' id='" +
                    topic.id +
                    "'>" +
                    title +
                    "</button>";
            }
            top_res_div.html(html);
            $(".btn", top_res_div).button();
        } else {
            html = "<div class='cat-topic-result-empty'>No Matches</div>";
            top_res_div.html(html);
        }
    }

    function makeCollDiv(item, div) {
        if (div) {
            $(".cat-coll-title", div).text(item.title);
            $(".cat-coll-notes", div).html(
                item.notes ? "&nbsp;" + util.generateNoteSpan(item) + "&nbsp;" : "",
            );
            // There is no way to update brief since it is not returned by updates
        } else {
            //return "<div class='cat-coll-title-div ui-widget-content ui-corner-all '>\
            return (
                "<div class='cat-coll-title-div'>\
                        <div class='row-flex'>\
                            <div class='cat-coll-icon'><span class='ui-icon ui-icon-" +
                util.getItemIcon(item) +
                "'></span></div>\
                            <div class='cat-coll-title'>" +
                util.escapeHTML(item.title) +
                "</div>\
                            <div class='cat-coll-notes'>" +
                (item.notes ? "&nbsp;" + util.generateNoteSpan(item) + "&nbsp;" : "") +
                "</div>" +
                (cur_mode == model.SM_COLLECTION
                    ? "<div class='cat-coll-btn-div'><button class='btn btn-icon btn-cat-coll-open'><span class='ui-icon " +
                      icon_open +
                      "'></span></button></div>"
                    : "") +
                "</div>\
                        <div class='cat-coll-info-div'>\
                            <div class='cat-coll-info-brief'>" +
                (item.desc ? util.escapeHTML(item.desc) : "(no description)") +
                "</div>\
                            <div><table class='cat-coll-info-table'><tr><td>" +
                (item.owner.startsWith("u/")
                    ? "Owner:</td><td>" + item.ownerName
                    : "Project:</td><td>" + item.owner.substr(2)) +
                "</td></tr>\
                                <tr><td>ID / Alias:</td><td>" +
                item.id +
                (item.alias ? " (" + item.alias + ")" : "") +
                "</td></tr>" +
                "</table></div>\
                        </div>\
                    </div>"
            );
        }
    }

    function setItems(data) {
        var html = "",
            item;
        if (data.item && data.item.length) {
            cur_items = {};

            for (var i in data.item) {
                item = data.item[i];
                cur_items[item.id] = item;
                html +=
                    "<div class='cat-coll' id='" +
                    item.id.charAt(0) +
                    "_" +
                    item.id.substr(2) +
                    "'>" +
                    makeCollDiv(item) +
                    "</div>";
            }
        } else {
            html =
                "<div class='cat-coll-empty'>No matching collections or data records.<p>Try other categories and/or adjust filter options.</p></div>";
        }

        $(".cat-coll-prev", cat_panel).button(data.offset ? "enable" : "disable");
        $(".cat-coll-next", cat_panel).button(
            data.offset + data.count < data.total ? "enable" : "disable",
        );

        cat_coll_div.html(html);
        $(".btn", cat_coll_div).button();
        cur_sel = null;
        a_parent.updateBtnState();
    }

    $(".btn-cat-home", cat_panel).on("click", function () {
        if (cat_tree_div.is(":visible")) {
            closeCollTree();
        } else {
            cur_sel = null;
            a_parent.updateBtnState();
        }

        cat_coll_div.html("Loading...");

        loadTopics(null, function () {
            cur_topic = [];
            cur_topic_div.text("Home");
        });

        topic_tags = [];
        coll_off = 0;
        loadCollections();
    });

    // Back is used to both navigate topic tree and to return from a collection view
    $(".btn-cat-back", cat_panel).on("click", function () {
        if (cat_tree_div.is(":visible")) {
            // A collection was open, close it but do not alter current topic
            closeCollTree();

            // Remove collection name from end of topic path
            cur_topic.pop();
            setTopicPath();
        } else if (cur_topic.length) {
            // Search results were open, navigate back/up in topic hierarchy
            cur_sel = null;
            a_parent.updateBtnState();

            // Remove last topic tag
            topic_tags.pop();

            // Adjust topic path and reload topics
            cur_topic.pop();
            setTopicPath();
            loadTopics(cur_topic.length ? cur_topic[cur_topic.length - 1].id : null);
        }

        cat_coll_div.html("Loading...");
        coll_off = 0;
        loadCollections();
    });

    $(".btn-cat-topic-res-cls", cat_panel).on("click", function () {
        $("#cat_topic_result_div").hide();
        $(".cat-search-div", cat_panel).hide();
    });

    function searchTopics() {
        var phrase = $("#cat_topic_search_phrase", cat_panel).val().trim();
        if (phrase) {
            topics_panel.show();
            top_res_div.html("(loading...)").show();

            api.topicSearch(phrase, function (ok, data) {
                if (ok) {
                    setSearchTopics(data);
                } else {
                    setSearchTopics({});
                    util.setStatusText("Topic search error " + data, true);
                }
            });
        } else {
            setSearchTopics({});
        }
    }

    $(".btn-cat-search", cat_panel).on("click", function () {
        $(".cat-search-div", cat_panel).toggle();
    });

    $(".btn-cat-topic-search", cat_panel).on("click", function () {
        searchTopics();
    });

    $("#cat_topic_search_phrase").on("keypress", function (e) {
        if (e.keyCode == 13) {
            searchTopics();
        }
    });

    topics_div.on("click", ".cat-topic", onTopicActivate);
    topics_div.on("dblclick", ".cat-topic", onTopicClick);
    topics_div.on("click", ".btn-cat-topic-open", onTopicClick);

    $("#cat_topic_result_div", cat_panel).on("click", ".cat-topic-result", onSearchTopicClick);
    cat_coll_div.on("click", ".cat-coll", onCollectionActivate);
    cat_coll_div.on("click", ".btn-cat-coll-open", onCollectionOpen);
    cat_coll_div.on("dblclick", ".cat-coll-title-div", onCollectionOpen);

    cat_panel.on("click", ".cat-coll-next", onCollectionsNext);
    cat_panel.on("click", ".cat-coll-prev", onCollectionsPrev);

    tags_div.tagit({
        autocomplete: {
            delay: 500,
            minLength: 3,
            source: "/api/tag/autocomp",
        },
        caseSensitive: false,
        removeConfirmation: true,
        afterTagAdded: function (ev, ui) {
            user_tags.push(ui.tagLabel);
            coll_off = 0;
            loadCollections();
        },
        beforeTagRemoved: function (ev, ui) {
            var idx = user_tags.indexOf(ui.tagLabel);
            if (idx != -1) user_tags.splice(idx, 1);
            coll_off = 0;
            loadCollections();
        },
    });

    this.searchPanel_Run = function (a_qry) {
        coll_off = 0;
        loadCollections();
    };

    var search_panel = panel_search.newSearchPanel($("#cat_search_panel", cat_panel), "cat", this, {
        no_select: true,
        no_save_btn: true,
        no_run_btn: true,
    });
    var search_sel_mode = false;

    util.inputTheme($("input,textarea", cat_panel));

    this.setSearchSelectMode = function (a_enabled) {
        search_sel_mode = a_enabled;
    };

    this.refreshUI = function (a_ids, a_data, a_reload) {
        // This doesn't work yet
    };

    model.registerUpdateListener(function (a_data) {
        var data;

        if (cat_tree_div.is(":visible")) {
            cat_tree.visit(function (node) {
                if (node.key in a_data) {
                    data = a_data[node.key];
                    // Update size if changed
                    if (node.key.startsWith("d/") && node.data.size != data.size) {
                        node.data.size = data.size;
                    }

                    util.refreshNodeTitle(node, data);
                }
            });

            a_parent.updateBtnState();
        } else {
            // Only care about collections in updates
            var div;
            for (var i in a_data) {
                data = a_data[i];
                div = $("#" + data.id.charAt(0) + "_" + data.id.substr(2), cat_coll_div);
                if (div.length) {
                    makeCollDiv(data, div);
                }
            }
        }
    });

    function onCollectionsNext() {
        coll_off += settings.opts.page_sz;
        loadCollections();
    }

    function onCollectionsPrev() {
        if (coll_off > settings.opts.page_sz) {
            coll_off -= settings.opts.page_sz;
        } else {
            coll_off = 0;
        }
        loadCollections();
    }

    function loadCollections() {
        $(".cat-coll-prev,.btn-cat-home,.btn-cat-back,.cat-topic-result", cat_panel).button(
            "disable",
        );

        loading |= 2;

        cat_coll_div.html("Loading...");

        var coll_qry = search_panel.getQuery();

        coll_qry.published = true;
        coll_qry.offset = coll_off;
        coll_qry.count = settings.opts.page_sz;
        coll_qry.catTags = topic_tags;

        cur_mode = coll_qry.mode; //parseInt( $(".cat-mode",cat_panel).val() );

        api.dataSearch(coll_qry, function (ok, data) {
            loading &= 1;

            if (ok) {
                setItems(data);
            } else {
                setItems([]);
                util.setStatusText(data, true);
            }

            updateTopicNav();
        });
    }

    //top_res_div.html( "(loading...)" );
    //loadTopics();
    //loadCollections();

    return this;
}
