export var theme = "light";
export var user = null;
export var ep_recent = [];
export var opts = {
    page_sz: 20,
    task_hist: 168,
    meta_val: 1,
};

export var date_opts = {
    year: "2-digit",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "numeric",
    hour12: false,
    second: "2-digit",
};

/*
export function loadUser() {
    //console.log( "settings.loadUser" );

    var cookie_user = Cookies.get( 'sdms-user' );
    //console.log( "user cookie: ", user );

    if ( cookie_user ) {
        user = JSON.parse( cookie_user );
    } else {
        user = null;
    }

    //console.log( "user: ", g_user );
}*/

export function setUser(a_user) {
    user = {
        uid: a_user.uid.substr(2),
        nameFirst: a_user.nameFirst,
        nameLast: a_user.nameLast,
        email: a_user.email,
        isAdmin: a_user.isAdmin,
        isRepoAdmin: a_user.isRepoAdmin,
    };

    if (a_user.options) {
        opts = JSON.parse(a_user.options);
    }
}

export function clearUser() {
    user = null;
}

export function setTheme(a_theme) {
    theme = a_theme;
}

export function setUserEmail(a_email) {
    user.email = a_email;
}

export function setUserAdmin(a_is_admin) {
    user.isAdmin = a_is_admin;
}

export function setUserRepoAdmin(a_is_repo_admin) {
    user.isRepoAdmin = a_is_repo_admin;
}

export function setOptions(a_options_json) {
    opts = JSON.parse(a_options_json);
}

export function setOptionsObj(a_options) {
    opts = a_options;
}

export function epSetRecent(a_ep_recent) {
    ep_recent = a_ep_recent;
}
