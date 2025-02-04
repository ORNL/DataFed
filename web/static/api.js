import * as model from "./model.js";
import * as util from "./util.js";
import * as settings from "./settings.js";

export function _asyncGet(a_url, a_raw_json_data, a_callback, a_timeout) {
    $.ajax({
        url: a_url,
        global: false,
        type: "GET",
        data: a_raw_json_data,
        dataType: "json",
        context: { t0: Date.now() },
        success: function (a_data, a_status, a_xhr) {
            var elapsed = Date.now() - this.t0;
            if (elapsed > 500) {
                console.log("Slow AJAX response:", elapsed, "ms, url:", a_url);
            }
            if (a_callback) {
                a_callback(true, a_data);
            }
        },
        error: function (a_xhr, a_status, a_thrownError) {
            if (a_callback) {
                if (a_xhr.responseText) a_callback(false, a_xhr.responseText);
                else if (a_thrownError) a_callback(false, a_thrownError);
                else if (a_status) a_callback(false, a_status);
                else a_callback(false, "Unknown error");
            }
        },
        timeout: a_timeout ? a_timeout : 10000,
    });
}

export function _asyncPost(a_url, a_raw_json_data, a_callback) {
    $.ajax({
        url: a_url,
        //global : false,
        type: "POST",
        data: JSON.stringify(a_raw_json_data, null, 0),
        dataType: "json",
        contentType: "application/json; charset=utf-8",
        success: function (a_data) {
            if (a_callback) {
                a_callback(true, a_data);
            }
        },
        error: function (a_xhr, a_status, a_thrownError) {
            if (a_callback) {
                if (a_xhr.responseText) a_callback(false, a_xhr.responseText);
                else if (a_thrownError) a_callback(false, a_thrownError);
                else if (a_status) a_callback(false, a_status);
                else a_callback(false, "Unknown error");
            }
        },
        timeout: 5000,
    });
}

export function _asyncPostText(a_url, a_text_data, a_callback) {
    $.ajax({
        url: a_url,
        //global : false,
        type: "POST",
        data: a_text_data,
        dataType: "json",
        contentType: "text/plain",
        success: function (a_data) {
            if (a_callback) {
                a_callback(true, a_data);
            }
        },
        error: function (a_xhr, a_status, a_thrownError) {
            if (a_callback) {
                if (a_xhr.responseText) a_callback(false, a_xhr.responseText);
                else if (a_thrownError) a_callback(false, a_thrownError);
                else if (a_status) a_callback(false, a_status);
                else a_callback(false, "Unknown error");
            }
        },
        timeout: 5000,
    });
}

export function getDailyMessage(a_cb) {
    _asyncGet("/api/msg/daily", null, a_cb);
}

export function setDefaultAlloc(a_repo, a_subject, a_cb) {
    _asyncGet(
        "/api/repo/alloc/set/default?repo=" + a_repo + (a_subject ? "&subject=" + a_subject : ""),
        null,
        a_cb,
    );
}

export function xfrStart(a_ids, a_mode, a_path, a_ext, a_encrypt_mode, a_orig_fname, a_cb) {
    var url = "/api/dat/";

    if (a_mode == model.TT_DATA_GET) {
        url +=
            "get" +
            "?id=" +
            encodeURIComponent(JSON.stringify(a_ids)) +
            (a_orig_fname ? "&orig_fname=1" : "");
    } else if (a_mode == model.TT_DATA_PUT) {
        url += "put" + "?id=" + encodeURIComponent(a_ids[0]);
    } else {
        return;
    }

    url +=
        "&path=" +
        encodeURIComponent(a_path) +
        "&encrypt=" +
        a_encrypt_mode +
        (a_ext && a_ext.length ? "&ext=" + encodeURIComponent(a_ext) : "");

    _asyncGet(url, null, function (ok, data) {
        if (ok) {
            epRecentLoad(function () {
                if (a_cb) a_cb(ok, data);
            });
        } else {
            if (a_cb) a_cb(ok, data);
        }
    });
}

export function dataView(a_id, a_cb) {
    _asyncGet("/api/dat/view?id=" + encodeURIComponent(a_id), null, function (ok, reply) {
        if (ok) {
            a_cb(reply.data[0]);
        } else {
            util.setStatusText("View Data Error: " + reply, true);
        }
    });
}

export function dataExport(a_ids, a_cb) {
    _asyncGet("/api/dat/export?ids=" + encodeURIComponent(JSON.stringify(a_ids)), null, a_cb);
}

export function dataAllocChange(a_ids, a_repo_id, a_proj_id, a_check, a_cb) {
    var url =
        "/api/dat/alloc_chg?id=" +
        encodeURIComponent(JSON.stringify(a_ids)) +
        "&repo_id=" +
        encodeURIComponent(a_repo_id);
    if (a_proj_id) url += "&proj_id=" + encodeURIComponent(a_proj_id);
    if (a_check) url += "&check=1";

    _asyncGet(url, null, a_cb);
}

export function dataOwnerChange(a_ids, a_coll_id, a_repo_id, a_proj_id, a_check, a_cb) {
    var url =
        "/api/dat/owner_chg?id=" +
        encodeURIComponent(JSON.stringify(a_ids)) +
        "&coll_id=" +
        encodeURIComponent(a_coll_id);
    if (a_repo_id) url += "&repo_id=" + encodeURIComponent(a_repo_id);
    if (a_proj_id) url += "&proj_id=" + encodeURIComponent(a_proj_id);
    if (a_check) url += "&check=1";

    _asyncGet(url, null, a_cb);
}

export function dataGetCheck(a_ids, a_cb) {
    _asyncGet(
        "/api/dat/get?id=" + encodeURIComponent(JSON.stringify(a_ids)) + "&check=true",
        null,
        a_cb,
    );
}

export function dataPutCheck(a_id, a_cb) {
    _asyncGet("/api/dat/put?id=" + encodeURIComponent(a_id) + "&check=true", null, a_cb);
}

export function dataGetDeps(a_ids, a_cb) {
    _asyncGet("/api/dat/dep/get?ids=" + encodeURIComponent(a_ids), null, function (ok, data) {
        if (ok) {
            a_cb(data);
        } else {
            util.setStatusText("Get Dependencies Error: " + data, true);
            a_cb();
        }
    });
}

export function dataGetDepGraph(a_id, a_cb) {
    _asyncGet("/api/dat/dep/graph/get?id=" + encodeURIComponent(a_id), null, function (ok, data) {
        if (ok) {
            a_cb(data);
        } else {
            util.setStatusText("Get Dependency Graph Error: " + data);
            a_cb();
        }
    });
}

export function dataCreate(a_record, a_cb) {
    _asyncPost("/api/dat/create", a_record, function (ok, reply) {
        if (a_cb) a_cb(ok, reply);

        if (ok && reply.update) model.update(reply.update);
    });
}

export function dataCreateBatch(a_records, a_cb) {
    _asyncPostText("/api/dat/create/batch", a_records, function (ok, reply) {
        if (a_cb) a_cb(ok, reply);
    });
}

export function dataUpdate(a_record, a_cb) {
    _asyncPost("/api/dat/update", a_record, function (ok, reply) {
        if (a_cb) a_cb(ok, reply);

        if (ok && reply.update) model.update(reply.update);
    });
}

export function dataUpdateBatch(a_records, a_cb) {
    _asyncPostText("/api/dat/update/batch", a_records, function (ok, reply) {
        if (a_cb) a_cb(ok, reply);

        if (ok && reply.update) model.update(reply.update);
    });
}

export function sendDataDelete(a_ids, a_cb) {
    _asyncGet("/api/dat/delete?ids=" + encodeURIComponent(JSON.stringify(a_ids)), null, a_cb);
}

export function copyData(a_src_id, a_dst_id, a_cb) {
    _asyncGet(
        "/api/dat/copy?src=" +
            encodeURIComponent(a_src_id) +
            "&dst=" +
            encodeURIComponent(a_dst_id),
        null,
        a_cb,
    );
}

export function dataSearch(a_query, a_callback) {
    _asyncPost("/api/dat/search", a_query, a_callback);
}

export function dataPubSearch(a_query, a_cb) {
    _asyncPost("/api/col/pub/search/data", a_query, a_cb);
}

export function sendDataLock(a_ids, a_lock, a_cb) {
    _asyncGet(
        "/api/dat/lock?lock=" + a_lock + "&ids=" + encodeURIComponent(JSON.stringify(a_ids)),
        null,
        a_cb,
    );
}

export function metadataValidate(a_sch_id, a_metadata, a_cb) {
    var doc = { schId: a_sch_id, metadata: a_metadata };
    _asyncPost("/api/metadata/validate", doc, a_cb);
}

export function collView_url(a_id) {
    return "/api/col/view?id=" + encodeURIComponent(a_id);
}

export function collRead_url(a_id, a_offset, a_count) {
    return (
        "/api/col/read?id=" +
        encodeURIComponent(a_id) +
        (a_offset != undefined ? "&offset=" + a_offset : "") +
        (a_count != undefined ? "&count=" + a_count : "")
    );
}

export function collRead(a_id, a_offset, a_count, a_cb) {
    _asyncGet(collRead_url(a_id, a_offset, a_count), null, a_cb);
}

export function collListPublished_url(a_owner, a_offset, a_count) {
    return (
        "/api/col/published/list?subject=" +
        encodeURIComponent(a_owner) +
        "&offset=" +
        a_offset +
        "&count=" +
        a_count
    );
}

export function collView(a_id, a_cb) {
    //_asyncGet( "/api/col/view?id=" + encodeURIComponent(a_id), null, function( ok, data ){
    _asyncGet(collView_url(a_id), null, function (ok, data) {
        if (ok) {
            if (data) a_cb(data);
            else a_cb();
        } else {
            util.setStatusText("View Collection Error: " + data, true);
            a_cb();
        }
    });
}

export function collCreate(a_record, a_cb) {
    _asyncPost("/api/col/create", a_record, function (ok, reply) {
        if (a_cb) a_cb(ok, reply);

        //if ( ok && reply.update )
        //    model.update( reply.update );
    });
}

export function collUpdate(a_record, a_cb) {
    _asyncPost("/api/col/update", a_record, function (ok, reply) {
        if (a_cb) a_cb(ok, reply);

        if (ok && reply.update) model.update(reply.update);
    });
}

export function collDelete(a_ids, a_cb) {
    _asyncGet("/api/col/delete?ids=" + encodeURIComponent(JSON.stringify(a_ids)), null, a_cb);
}

export function catalogSearch(a_query, a_cb) {
    _asyncPost("/api/cat/search", a_query, a_cb);
    /*_asyncPost( "/api/col/pub/search", a_query, function( ok, data ){
        setTimeout( function(){ a_cb( ok, data ); }, 2000 );
    });*/
}

export function projList_url(a_owned, a_admin, a_member, a_sort, a_offset, a_count) {
    return (
        "/api/prj/list?owner=" +
        (a_owned ? "true" : "false") +
        "&admin=" +
        (a_admin ? "true" : "false") +
        "&member=" +
        (a_member ? "true" : "false") +
        (a_sort != undefined ? "&sort=" + a_sort : "") +
        (a_offset != undefined ? "&offset=" + a_offset : "") +
        (a_count != undefined ? "&count=" + a_count : "")
    );
}

export function projView(a_id, a_cb) {
    _asyncGet("/api/prj/view?id=" + encodeURIComponent(a_id), null, function (ok, data) {
        if (ok) {
            if (data) a_cb(data);
            else a_cb();
        } else {
            util.setStatusText("View Project Error: " + data, true);
            a_cb();
        }
    });
}

export function projCreate(a_project, a_cb) {
    _asyncPost("/api/prj/create", a_project, a_cb);
}

export function projUpdate(a_project, a_cb) {
    _asyncPost("/api/prj/update", a_project, a_cb);
}

export function projDelete(a_ids, a_cb) {
    _asyncGet(
        "/api/prj/delete?ids=" + encodeURIComponent(JSON.stringify(a_ids)),
        null,
        a_cb,
        200000,
    );
}

export function linkItems(a_items, a_coll, a_cb) {
    _asyncGet(
        "/api/col/link?items=" +
            encodeURIComponent(JSON.stringify(a_items)) +
            "&coll=" +
            encodeURIComponent(a_coll),
        null,
        a_cb,
    );
}

export function unlinkItems(a_items, a_coll, a_cb) {
    _asyncGet(
        "/api/col/unlink?items=" +
            encodeURIComponent(JSON.stringify(a_items)) +
            "&coll=" +
            encodeURIComponent(a_coll),
        null,
        a_cb,
    );
}

export function colMoveItems(a_items, a_src_id, a_dst_id, a_cb) {
    _asyncGet(
        "/api/col/move?items=" +
            encodeURIComponent(JSON.stringify(a_items)) +
            "&src_id=" +
            encodeURIComponent(a_src_id) +
            "&dst_id=" +
            encodeURIComponent(a_dst_id),
        null,
        a_cb,
    );
}

export function getParents(a_id, a_cb) {
    _asyncGet("/api/col/get_parents?id=" + encodeURIComponent(a_id), null, a_cb);
}

export function getCollOffset(coll_id, item_id, page_sz, idx, cb) {
    _asyncGet(
        "/api/col/get_offset?id=" +
            encodeURIComponent(coll_id) +
            "&item_id=" +
            encodeURIComponent(item_id) +
            "&page_sz=" +
            page_sz,
        null,
        function (ok, data) {
            cb(ok, data, idx);
        },
    );
}

// ===== ACL URL METHODS

export function aclListSharedItems_url(a_owner) {
    return "/api/acl/shared/list/items?owner=" + encodeURIComponent(a_owner);
}

export function aclListSharedUsers_url() {
    return "/api/acl/shared/list?inc_users=true";
}

export function aclListSharedProjects_url() {
    return "/api/acl/shared/list?inc_projects=true";
}

// ===== ACL METHODS

export function aclView(a_id, a_cb) {
    _asyncGet("/api/acl/view?id=" + encodeURIComponent(a_id), null, a_cb);
}

export function aclUpdate(a_id, a_rules, a_cb) {
    _asyncGet(
        "/api/acl/update?id=" +
            encodeURIComponent(a_id) +
            "&rules=" +
            encodeURIComponent(JSON.stringify(a_rules)),
        null,
        a_cb,
    );
}

export function aclByUser(a_cb) {
    _asyncGet(aclListSharedUsers_url(), null, a_cb);
}

export function aclByUserList(a_user_id, a_cb) {
    _asyncGet(aclListSharedItems_url(a_user_id), null, a_cb);
}

export function aclByProject(a_cb) {
    _asyncGet(aclListSharedProjects_url(), null, a_cb);
}

export function aclByProjectList(a_proj_id, a_cb) {
    _asyncGet(aclListSharedItems_url(a_proj_id), null, a_cb);
}

export function checkPerms(a_id, a_perms, a_cb) {
    _asyncGet(
        "/api/perms/check?id=" + encodeURIComponent(a_id) + (a_perms ? "&perms=" + a_perms : ""),
        null,
        function (ok, data) {
            a_cb(ok, ok ? data.granted : data);
        },
    );
}

export function getPerms(a_id, a_perms, a_cb) {
    _asyncGet(
        "/api/perms/get?id=" + encodeURIComponent(a_id) + (a_perms ? "&perms=" + a_perms : ""),
        null,
        function (ok, data) {
            if (ok) a_cb(data.granted);
            else a_cb(false);
        },
    );
}

export function userListAll_url(a_offset, a_count) {
    return (
        "/api/usr/list/all" +
        (a_offset != undefined && a_count != undefined
            ? "?offset=" + a_offset + "&count=" + a_count
            : "")
    );
}

export function userListCollab_url(a_offset, a_count) {
    return (
        "/api/usr/list/collab" +
        (a_offset != undefined && a_count != undefined
            ? "?offset=" + a_offset + "&count=" + a_count
            : "")
    );
}

export function userRegister(a_password, a_cb) {
    _asyncGet(
        "/api/usr/register" + (a_password ? "?pw=" + encodeURIComponent(a_password) : ""),
        null,
        a_cb,
    );
}

export function userFindByName_url(a_search_word, a_offset, a_count) {
    return (
        "/api/usr/find/by_name_uid?name_uid=" +
        encodeURIComponent(a_search_word) +
        "&offset=" +
        a_offset +
        "&count=" +
        a_count
    );
}

export function userView(a_id, a_details, a_cb) {
    _asyncGet(
        "/api/usr/view?id=" + encodeURIComponent(a_id) + (a_details ? "&details=true" : ""),
        null,
        a_cb,
    );
}

export function userFindByNameUID(a_name_uid, a_offset, a_count, a_cb) {
    if (!a_cb) return;

    var url = "/api/usr/find/by_name_uid?name_uid=" + encodeURIComponent(a_name_uid);

    if (a_offset != undefined && a_count != undefined)
        url += "&offset=" + a_offset + "&count=" + a_count;

    _asyncGet(url, null, a_cb);
}

export function userRevokeCredentials(a_cb) {
    _asyncGet("/api/usr/revoke_cred", null, a_cb);
}

export function userUpdate(a_uid, a_pw, a_email, a_opts, a_cb) {
    _asyncGet(
        "/api/usr/update?uid=" +
            encodeURIComponent(a_uid) +
            (a_pw ? "&pw=" + encodeURIComponent(a_pw) : "") +
            (a_email ? "&email=" + encodeURIComponent(a_email) : "") +
            (a_opts ? "&opts=" + encodeURIComponent(JSON.stringify(a_opts)) : ""),
        null,
        a_cb,
    );
}

export function annotationView_url(a_id) {
    return "/api/note/view?id=" + encodeURIComponent(a_id);
}

export function annotationListBySubject(a_id, a_cb) {
    _asyncGet("/api/note/list/by_subject?subject=" + encodeURIComponent(a_id), null, a_cb);
}

export function annotationView(a_id, a_cb) {
    _asyncGet(annotationView_url(a_id), null, a_cb);
}

export function annotationCreate(a_subj_id, a_type, a_title, a_comment, a_activate, a_cb) {
    _asyncGet(
        "/api/note/create?subject=" +
            encodeURIComponent(a_subj_id) +
            "&type=" +
            a_type +
            "&title=" +
            encodeURIComponent(a_title) +
            "&comment=" +
            encodeURIComponent(a_comment) +
            (a_activate ? "&activate=true" : ""),
        null,
        function (ok, reply) {
            a_cb(ok, reply);

            if (ok && reply.update) model.update(reply.update);
        },
    );
}

export function annotationUpdate(a_id, a_comment, a_new_type, a_new_state, a_new_title, a_cb) {
    _asyncGet(
        "/api/note/update?id=" +
            encodeURIComponent(a_id) +
            "&comment=" +
            encodeURIComponent(a_comment) +
            (a_new_type != null ? "&new_type=" + a_new_type : "") +
            (a_new_state != null ? "&new_state=" + a_new_state : "") +
            (a_new_title != null ? "&new_title=" + a_new_title : ""),
        null,
        function (ok, reply) {
            a_cb(ok, reply);

            if (ok && reply.update) {
                model.update(reply.update);
            }
        },
    );
}

export function annotationCommentEdit(a_id, a_comment, a_comment_idx, a_cb) {
    _asyncGet(
        "/api/note/comment/edit?id=" +
            encodeURIComponent(a_id) +
            "&comment=" +
            encodeURIComponent(a_comment) +
            "&comment_idx=" +
            a_comment_idx,
        null,
        a_cb,
    );
}

export function repoList(a_details, a_list_all, a_cb) {
    var url = "/api/repo/list";
    if (a_details) url += "?details=true";
    if (a_list_all) url += (a_details ? "&" : "?") + "all=true";
    _asyncGet(url, null, a_cb);
}

export function repoView_url(a_repo) {
    return "/api/repo/view?id=" + encodeURIComponent(a_repo);
}

export function repoView(a_repo, a_cb) {
    _asyncGet(repoView_url(a_repo), null, a_cb);
}

export function repoCreate(a_repo_data, a_cb) {
    _asyncPost("/api/repo/create", a_repo_data, a_cb);
}

export function repoUpdate(a_repo_data, a_cb) {
    _asyncPost("/api/repo/update", a_repo_data, a_cb);
}

export function repoDelete(a_repo_id, a_cb) {
    _asyncGet("/api/repo/delete?id=" + a_repo_id, null, a_cb);
}

export function repoCalcSize(a_items, a_recursive, a_cb) {
    _asyncGet(
        "/api/repo/calc_size?recurse=" +
            a_recursive +
            "&items=" +
            encodeURIComponent(JSON.stringify(a_items)),
        null,
        function (ok, data) {
            a_cb(ok, data);
        },
    );
}

export function repoAllocListByOwner_url(a_owner) {
    return "/api/repo/alloc/list/by_subject?subject=" + encodeURIComponent(a_owner);
}

export function repoAllocListItems_url(a_repo, a_owner, a_offset, a_count) {
    return (
        "/api/dat/list/by_alloc?repo=" +
        encodeURIComponent(a_repo) +
        "&subject=" +
        encodeURIComponent(a_owner) +
        (a_offset != undefined ? "&offset=" + a_offset : "") +
        (a_count != undefined ? "&count=" + a_count : "")
    );
}

export function allocList(a_id, a_cb) {
    _asyncGet("/api/repo/alloc/list/by_repo?id=" + a_id, null, a_cb);
}

export function allocListBySubject(a_subject, a_inc_stats, a_cb) {
    var url = "/api/repo/alloc/list/by_subject?";
    if (a_subject) url += "subject=" + encodeURIComponent(a_subject);
    if (a_inc_stats) url += (a_subject ? "&" : "") + "stats=true";
    _asyncGet(url, null, a_cb);
}

export function allocListByObject(a_id, a_cb) {
    _asyncGet("/api/repo/alloc/list/by_object?id=" + a_id, null, a_cb);
}

export function allocView(a_repo, a_subject, a_cb) {
    _asyncGet(
        "/api/repo/alloc/view?repo=" +
            a_repo +
            (a_subject ? "&subject=" + encodeURIComponent(a_subject) : ""),
        null,
        a_cb,
    );
}

export function allocStats(a_repo, a_subject, a_cb) {
    _asyncGet(
        "/api/repo/alloc/stats?repo=" +
            a_repo +
            (a_subject ? "&subject=" + encodeURIComponent(a_subject) : ""),
        null,
        a_cb,
    );
}

export function allocCreate(a_repo, a_subject, a_data_limit, a_rec_limit, a_cb) {
    _asyncGet(
        "/api/repo/alloc/create?repo=" +
            a_repo +
            "&subject=" +
            encodeURIComponent(a_subject) +
            "&data_limit=" +
            a_data_limit +
            "&rec_limit=" +
            a_rec_limit,
        null,
        a_cb,
    );
}

export function allocDelete(a_repo, a_subject, a_cb) {
    _asyncGet(
        "/api/repo/alloc/delete?repo=" + a_repo + "&subject=" + encodeURIComponent(a_subject),
        null,
        a_cb,
    );
}

export function allocSet(a_repo, a_subject, a_data_limit, a_rec_limit, a_cb) {
    _asyncGet(
        "/api/repo/alloc/set?repo=" +
            a_repo +
            "&subject=" +
            encodeURIComponent(a_subject) +
            "&data_limit=" +
            a_data_limit +
            "&rec_limit=" +
            a_rec_limit,
        null,
        a_cb,
    );
}

export function groupView_url(a_uid, a_gid) {
    return "/api/grp/view?uid=" + encodeURIComponent(a_uid) + "&gid=" + encodeURIComponent(a_gid);
}

export function groupView(a_uid, a_gid, a_cb) {
    if (a_gid.startsWith("g/")) _asyncGet(groupView_url(a_uid, a_gid.substr(2)), null, a_cb);
    else _asyncGet(groupView_url(a_uid, a_gid), null, a_cb);
}

export function groupList_url(a_uid) {
    return "/api/grp/list?uid=" + encodeURIComponent(a_uid);
}

export function groupList(a_uid, a_cb) {
    _asyncGet(groupList_url(a_uid), null, a_cb);
}

export function groupCreate(a_uid, a_group, a_cb) {
    var url =
        "/api/grp/create?uid=" +
        encodeURIComponent(a_uid) +
        "&gid=" +
        encodeURIComponent(a_group.gid);
    if (a_group.title) url += "&title=" + encodeURIComponent(a_group.title);
    if (a_group.desc) url += "&desc=" + encodeURIComponent(a_group.desc);
    if (a_group.member && a_group.member.length) url += "&member=" + JSON.stringify(a_group.member);

    _asyncGet(url, null, function (ok, data) {
        if (a_cb) a_cb(ok, data);
    });
}

export function groupUpdate(a_group, a_cb) {
    var url =
        "/api/grp/update?uid=" +
        encodeURIComponent(a_group.uid) +
        "&gid=" +
        encodeURIComponent(a_group.gid);
    if (a_group.title) url += "&title=" + encodeURIComponent(a_group.title);
    if (a_group.desc) url += "&desc=" + encodeURIComponent(a_group.desc);
    if (a_group.add && a_group.add.length) url += "&add=" + JSON.stringify(a_group.add);
    if (a_group.rem && a_group.rem.length) url += "&rem=" + JSON.stringify(a_group.rem);

    _asyncGet(url, null, function (ok, data) {
        if (a_cb) a_cb(ok, data);
    });
}

export function groupDelete(a_uid, a_gid, a_cb) {
    _asyncGet(
        "/api/grp/delete?uid=" +
            encodeURIComponent(a_uid) +
            "&gid=" +
            encodeURIComponent(a_gid.startsWith("g/") ? a_gid.substr(2) : a_gid),
        null,
        a_cb,
    );
}

export function topicListTopics_url(a_id, a_offset, a_count) {
    if (a_id)
        return (
            "/api/top/list/topics?id=" +
            a_id +
            (a_offset != undefined && a_count != undefined
                ? "&offset=" + a_offset + "&count=" + a_count
                : "")
        );
    else
        return (
            "/api/top/list/topics" +
            (a_offset != undefined && a_count != undefined
                ? "?offset=" + a_offset + "&count=" + a_count
                : "")
        );
}

export function topicListTopics(a_id, a_offset, a_count, a_cb) {
    if (!a_cb) return;

    _asyncGet(topicListTopics_url(a_id, a_offset, a_count), null, a_cb);
    /*_asyncGet( topicListTopics_url( a_id, a_offset, a_count ), null, function( ok, data ){
        setTimeout( function(){ a_cb( ok, data ); }, 2000 );
    });*/
}

export function topicListColl_url(a_id, a_offset, a_count) {
    return (
        "/api/top/list/coll?id=" +
        a_id +
        (a_offset != undefined && a_count != undefined
            ? "&offset=" + a_offset + "&count=" + a_count
            : "")
    );
}

export function topicListColl(a_id, a_offset, a_count, a_cb) {
    if (!a_cb) return;

    _asyncGet(topicListColl_url(a_id, a_offset, a_count), null, a_cb);
}

export function topicSearch_url(a_phrase) {
    return "/api/top/search?phrase=" + a_phrase;
}

export function topicSearch(a_phrase, a_cb) {
    if (!a_cb) return;

    _asyncGet(topicSearch_url(a_phrase), null, a_cb);
}

export function topicView_url(a_id) {
    return "/api/top/view?id=" + encodeURIComponent(a_id);
}

export function topicView(a_id, a_cb) {
    if (!a_cb) return;

    _asyncGet(topicView_url(a_id), null, function (ok, reply) {
        if (ok) {
            a_cb(reply.topic ? reply.topic[0] : null);
        } else {
            util.setStatusText("View Topic Error: " + reply, true);
        }
    });
}

export function schemaView(a_id, a_res, a_cb) {
    if (!a_cb) return;

    _asyncGet(
        "/api/sch/view?id=" + encodeURIComponent(a_id) + (a_res ? "&resolve=true" : ""),
        null,
        function (ok, reply) {
            a_cb(ok, reply);
        },
    );
}

export function schemaSearch(a_req, a_cb) {
    if (!a_cb) return;

    _asyncPost("/api/sch/search", a_req, a_cb);
}

export function schemaCreate(a_req, a_cb) {
    _asyncPost("/api/sch/create", a_req, function (ok, reply) {
        if (a_cb) a_cb(ok, reply);
    });
}

export function schemaUpdate(a_req, a_cb) {
    _asyncPost("/api/sch/update", a_req, function (ok, reply) {
        if (a_cb) a_cb(ok, reply);
    });
}

export function schemaRevise(a_req, a_cb) {
    _asyncPost("/api/sch/revise", a_req, function (ok, reply) {
        if (a_cb) a_cb(ok, reply);
    });
}

export function schemaDelete(a_id, a_cb) {
    _asyncPost("/api/sch/delete?id=" + a_id, {}, function (ok, reply) {
        if (a_cb) a_cb(ok, reply);
    });
}

export function queryList_url(a_offset, a_count) {
    return "/api/query/list?offset=" + a_offset + "&count=" + a_count;
}

export function queryExec_url(a_id, a_offset, a_count) {
    var url = "/api/query/exec?id=" + encodeURIComponent(a_id);

    if (a_offset != undefined && a_count != undefined) {
        url += "&offset=" + a_offset + "&count=" + a_count;
    }

    return url;
}

export function queryCreate(a_title, a_query, a_callback) {
    _asyncPost("/api/query/create?title=" + encodeURIComponent(a_title), a_query, a_callback);
}

export function queryUpdate(a_id, a_title, a_query, a_callback) {
    var url = "/api/query/update?id=" + a_id;
    if (a_title != undefined) url += "&title=" + encodeURIComponent(a_title);
    _asyncPost(url, a_query, a_callback);
}

export function queryDelete(a_ids, a_cb) {
    _asyncGet("/api/query/delete?ids=" + encodeURIComponent(JSON.stringify(a_ids)), null, a_cb);
}

export function queryView(a_id, a_callback) {
    _asyncGet("/api/query/view?id=" + encodeURIComponent(a_id), null, a_callback);
}

export function epView(a_ep, a_cb) {
    _asyncGet("/ui/ep/view?ep=" + encodeURIComponent(a_ep), null, function (ok, data) {
        if (a_cb) a_cb(ok, data);
    });
}

export function epAutocomplete(a_term, a_cb) {
    _asyncGet("/ui/ep/autocomp?term=" + encodeURIComponent(a_term), null, function (ok, data) {
        if (a_cb) a_cb(ok, data);
    });
}

export function epRecentLoad(a_cb) {
    _asyncGet("/ui/ep/recent/load", null, function (ok, data) {
        if (ok) {
            settings.epSetRecent(data);
        }

        if (a_cb) a_cb();
    });
}

export function epDirList(a_ep, a_path, a_show_hidden, a_cb) {
    _asyncGet(
        "/ui/ep/dir/list?ep=" +
            encodeURIComponent(a_ep) +
            "&path=" +
            encodeURIComponent(a_path) +
            "&hidden=" +
            (a_show_hidden ? "true" : "false"),
        null,
        function (ok, data) {
            if (a_cb) {
                if (ok) a_cb(data);
                else {
                    a_cb();
                }
            }
        },
    );
}

export function themeSave(a_theme, a_cb) {
    _asyncGet("/ui/theme/save?theme=" + encodeURIComponent(a_theme), null, a_cb);
}

export function getGlobusConsentURL(
    a_cb,
    collection_id,
    requested_scopes,
    refresh_tokens = false,
    query_params = {},
    state = "_default",
) {
    _asyncGet(
        "/api/globus/consent_url",
        {
            collection_id,
            refresh_tokens,
            requested_scopes: requested_scopes.join(","),
            query_params: JSON.stringify(query_params),
            state,
        },
        a_cb,
    );
}

export function taskList_url(a_since) {
    return "/api/task/list" + (a_since != undefined ? "?since=" + a_since : "");
}

export function taskView(a_id, a_cb) {
    _asyncGet("/api/task/view?id=" + encodeURIComponent(a_id), null, function (ok, reply) {
        if (ok) {
            a_cb(reply.task[0]);
        } else {
            util.setStatusText("Task Data Error: " + reply, true);
        }
    });
}
