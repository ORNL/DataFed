#!/usr/bin/env node

"use strict";

/*
This is the DataFed web server that provides both the web portal application (/ui) and the web API (/api).
User authentication is provided by Globus Auth API, and session information is stored in TWO cookies:

- 'connect.sid' - The session cookie itself
- 'datafed-theme' - User's preferred theme

*/

if (process.argv.length != 3) {
    throw "Invalid arguments, usage: datafed-ws config-file";
}

import web_version from "./version.js";
import express from "express"; // For REST api
import session from "express-session";
import sanitizeHtml from "sanitize-html";
import cookieParser from "cookie-parser"; // cookies for user state
import http from "http";
import https from "https";
import crypto from "crypto";
import helmet from "helmet";
import fs from "fs";
import ini from "ini";
import protobuf from "protobufjs";
import zmq from "zeromq";
import ECT from "ect"; // for html templates
import ClientOAuth2 from "client-oauth2";
import { v4 as uuidv4 } from "uuid";

import { fileURLToPath } from "url";
import { dirname } from "path";

import OAuthTokenHandler, { AccessTokenType } from "./services/auth/TokenHandler.js";
import { generateConsentURL } from "./services/auth/ConsentHandler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

var ectRenderer = ECT({ watch: true, root: __dirname + "/views", ext: ".ect" });
const app = express();

const MAX_CTX = 50;

var g_host,
    g_port,
    g_server_key_file,
    g_server_cert_file,
    g_server_chain_file,
    g_system_secret,
    g_session_secret,
    g_test,
    g_msg_by_id = {},
    g_msg_by_name = {},
    g_core_sock = zmq.socket("dealer"),
    g_core_serv_addr,
    g_globus_auth,
    g_extern_url,
    g_oauth_credentials,
    g_ctx = new Array(MAX_CTX),
    g_ctx_next = 0,
    g_client_id,
    g_client_secret,
    g_ready_start = 4,
    g_version,
    g_ver_release_year,
    g_ver_release_month,
    g_ver_release_day,
    g_ver_release_hour,
    g_ver_release_minute,
    g_ver_api_major,
    g_ver_api_minor,
    g_ver_api_patch,
    g_tls,
    g_google_analytics;

const nullfr = Buffer.from([]);

g_ctx.fill(null);

const LogLevel = {
    CRITICAL: 0,
    ERROR: 1,
    WARNING: 2,
    INFO: 3,
    DEBUG: 4,
    TRACE: 5,
};

class Logger {
    constructor(level) {
        this._level = level;
    }

    log(message_type, function_name, line_number, message, correlation_id) {
        const now = new Date();
        const isoDateTime = now.toISOString();
        var log_line = `${isoDateTime} datafed-ws ${message_type} datafed-ws.js:${function_name}:${line_number} \{ \"thread_id\": 0, \"message\": \"${message}\" `;
        if (correlation_id !== "") {
            log_line += `, \"correlation_id\": \"${correlation_id}\"`;
        }
        log_line += ` \}`;
        console.log(log_line);
    }

    critical(function_name, line_number, message, correlation_id = "") {
        if (this._level >= LogLevel.CRITICAL) {
            this.log("CRIT", function_name, line_number, message, correlation_id);
        }
    }

    error(function_name, line_number, message, correlation_id = "") {
        if (this._level >= LogLevel.ERROR) {
            this.log("ERROR", function_name, line_number, message, correlation_id);
        }
    }

    warning(function_name, line_number, message, correlation_id = "") {
        if (this._level >= LogLevel.WARNING) {
            this.log("WARNING", function_name, line_number, message, correlation_id);
        }
    }

    info(function_name, line_number, message, correlation_id = "") {
        if (this._level >= LogLevel.INFO) {
            this.log("INFO", function_name, line_number, message, correlation_id);
        }
    }

    debug(function_name, line_number, message, correlation_id = "") {
        if (this._level >= LogLevel.DEBUG) {
            this.log("DEBUG", function_name, line_number, message, correlation_id);
        }
    }

    trace(function_name, line_number, message, correlation_id = "") {
        if (this._level >= LogLevel.TRACE) {
            this.log("TRACE", function_name, line_number, message, correlation_id);
        }
    }
}

const logger = new Logger(LogLevel.INFO);

function getCurrentLineNumber() {
    const stackTrace = new Error().stack;
    const lineMatches = stackTrace.match(/:\d+:\d+/g);

    if (lineMatches && lineMatches.length > 1) {
        const lineNumber = lineMatches[1].substring(1);
        return parseInt(lineNumber, 10);
    }

    return undefined; // Line number could not be determined
}

function startServer() {
    logger.info(startServer.name, getCurrentLineNumber(), `Host: ${g_host}`);
    logger.info(startServer.name, getCurrentLineNumber(), `Port: ${g_port}`);
    const message = "TLS:" + g_tls ? "Yes" : "No";
    logger.info(startServer.name, getCurrentLineNumber(), message);
    if (g_tls) {
        logger.debug(
            startServer.name,
            getCurrentLineNumber(),
            `Server key file: ${g_server_key_file}`,
        );
        logger.debug(
            startServer.name,
            getCurrentLineNumber(),
            `Server cert file: ${g_server_cert_file}`,
        );
        logger.debug(
            startServer.name,
            getCurrentLineNumber(),
            `Server chain file: ${g_server_chain_file}`,
        );
    }
    logger.info(startServer.name, getCurrentLineNumber(), `External URL: ${g_extern_url}`);
    logger.info(startServer.name, getCurrentLineNumber(), `Core server addr: ${g_core_serv_addr}`);
    logger.info(startServer.name, getCurrentLineNumber(), `Test mode: ${g_test}`);

    g_core_sock.connect(g_core_serv_addr);
    sendMessageDirect("VersionRequest", "", {}, function (reply) {
        if (!reply) {
            logger.error(
                startServer.name,
                getCurrentLineNumber(),
                "ERROR: No reply from core server",
            );
        } else if (
            reply.api_major != g_ver_api_major ||
            reply.api_minor < g_ver_api_minor ||
            reply.api_minor > g_ver_api_minor + 9
        ) {
            logger.error(
                startServer.name,
                getCurrentLineNumber(),
                "ERROR: Incompatible api version detected (" +
                    reply.api_major +
                    "." +
                    reply.api_minor +
                    "." +
                    reply.api_patch +
                    ")",
            );
        } else {
            var warning_msg =
                "WARNING: A newer web server may be available the latest release version is: (" +
                reply.release_year +
                "." +
                reply.release_month +
                "." +
                reply.release_day +
                "." +
                reply.release_hour +
                "." +
                reply.release_minute;
            if (reply.release_year > g_ver_release_year) {
                logger.warning(startServer.name, getCurrentLineNumber(), warning_msg);
            } else if (reply.release_year == g_ver_release_year) {
                if (reply.release_month > g_ver_release_month) {
                    logger.warning(startServer.name, getCurrentLineNumber(), warning_msg);
                } else if (reply.release_month == g_ver_release_month) {
                    if (reply.release_day > g_ver_release_day) {
                        logger.warning(startServer.name, getCurrentLineNumber(), warning_msg);
                    } else if (reply.release_day == g_ver_release_day) {
                        if (reply.release_hour > g_ver_release_hour) {
                            logger.warning(startServer.name, getCurrentLineNumber(), warning_msg);
                        } else if (reply.release_hour == g_ver_release_hour) {
                            if (reply.release_minute > g_ver_release_minute) {
                                logger.warning(
                                    startServer.name,
                                    getCurrentLineNumber(),
                                    warning_msg,
                                );
                            }
                        }
                    }
                }
            }

            g_oauth_credentials = {
                clientId: g_client_id,
                clientSecret: g_client_secret,
                authorizationUri: "https://auth.globus.org/v2/oauth2/authorize",
                accessTokenUri: "https://auth.globus.org/v2/oauth2/token",
                redirectUri: g_extern_url + "/ui/authn",
                scopes: "urn:globus:auth:scope:transfer.api.globus.org:all offline_access openid",
            };

            g_globus_auth = new ClientOAuth2(g_oauth_credentials);

            var server;
            if (g_tls) {
                var privateKey = fs.readFileSync(g_server_key_file, "utf8");
                var certificate = fs.readFileSync(g_server_cert_file, "utf8");
                var chain;
                if (g_server_chain_file) {
                    chain = fs.readFileSync(g_server_chain_file, "utf8");
                }
                server = https.createServer(
                    {
                        key: privateKey,
                        cert: certificate,
                        ca: chain,
                        secureOptions: crypto.SSL_OP_NO_SSLv2 | crypto.SSL_OP_NO_SSLv3,
                    },
                    app,
                );
            } else {
                server = http.createServer({}, app);
            }

            server.listen(g_port);
        }
    });
}

loadSettings();

express.static.mime.define({ "application/javascript": ["js"] });

// Enforce HSTS
app.use(helmet());

app.use(express.static(__dirname + "/static"));
// body size limit = 100*max metadata size, which is 100 Kb
app.use(express.json({ type: "application/json", limit: "1048576" }));
app.use(express.text({ type: "text/plain", limit: "1048576" }));
// Setup session management and cookie settings
app.use(
    session({
        secret: g_session_secret,
        resave: false,
        rolling: true,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            maxAge: 432000000, // 5 days in msec
            secure: true, // can't be true if load balancer in use
            sameSite: "lax",
        },
    }),
);

function storeCollectionId(req, res, next) {
    if (req.query.collection_id) {
        req.session.collection_id = req.query.collection_id;
    }
    next();
}

app.use(cookieParser(g_session_secret));
app.use(
    helmet({
        hsts: {
            maxAge: 31536000,
        },
        contentSecurityPolicy: {
            useDefaults: true,
            directives: {
                "script-src": [
                    "'self'",
                    "'unsafe-inline'",
                    "https://cdnjs.cloudflare.com",
                    "https://cdn.jsdelivr.net",
                    "https://d3js.org",
                    "blob:",
                ],
                "img-src": ["*", "data:"],
            },
        },
    }),
);

app.use(function (req, res, next) {
    res.setHeader("Content-Language", "en-US");
    next();
});

app.set("view engine", "ect");
app.engine("ect", ectRenderer.render);

app.get("/", (a_req, a_resp) => {
    if (a_req.session.uid && a_req.session.reg) a_resp.redirect("/ui/main");
    else {
        a_resp.redirect("/ui/welcome");
    }
});

app.get("/ui/welcome", (a_req, a_resp) => {
    if (a_req.session.uid && a_req.session.reg) a_resp.redirect("/ui/main");
    else {
        logger.debug(
            "/ui/welcome",
            getCurrentLineNumber(),
            "Access welcome from: " + a_req.connection.remoteAddress,
        );

        var theme = a_req.cookies["datafed-theme"] || "light";
        const nonce = crypto.randomBytes(16).toString("base64");
        a_resp.locals.nonce = nonce;
        a_resp.setHeader("Content-Security-Policy", `script-src 'nonce-${nonce}'  auth.globus.org`);
        a_resp.render("index", {
            nonce: a_resp.locals.nonce,
            theme: theme,
            version: g_version,
            test_mode: g_test,
            ...g_google_analytics,
        });
    }
});

app.get("/ui/main", (a_req, a_resp) => {
    if (a_req.session.uid && a_req.session.reg) {
        logger.info(
            "/ui/main",
            getCurrentLineNumber(),
            "Access main (" + a_req.session.uid + ") from " + a_req.connection.remoteAddress,
        );

        var theme = a_req.cookies["datafed-theme"] || "light";
        const nonce = crypto.randomBytes(16).toString("base64");
        a_resp.locals.nonce = nonce;
        a_resp.setHeader("Content-Security-Policy", `script-src 'nonce-${nonce}'`);
        a_resp.render("main", {
            nonce: a_resp.locals.nonce,
            user_uid: a_req.session.uid,
            theme: theme,
            version: g_version,
            test_mode: g_test,
            ...g_google_analytics,
        });
    } else {
        // datafed-user cookie not set, so clear datafed-id before redirect
        //a_resp.clearCookie( 'datafed-id' );
        a_resp.redirect("/");
    }
});

/* This is the post-Globus registration page where user may enter a password before continuing to main
 */
app.get("/ui/register", (a_req, a_resp) => {
    logger.debug("/ui/register", getCurrentLineNumber(), "Begin registering.");

    if (!a_req.session.uid) {
        logger.info("/ui/register", getCurrentLineNumber(), " - no uid, go to /");
        a_resp.redirect("/");
    } else if (a_req.session.reg) {
        logger.info(
            "/ui/register",
            getCurrentLineNumber(),
            " - already registered, go to /ui/main",
        );
        a_resp.redirect("/ui/main");
    } else {
        logger.info(
            "/ui/register",
            getCurrentLineNumber(),
            " - registration access (" +
                a_req.session.uid +
                ") from " +
                a_req.connection.remoteAddress,
        );

        var theme = a_req.cookies["datafed-theme"] || "light";
        const clean = sanitizeHtml(a_req.session.name);
        const nonce = crypto.randomBytes(16).toString("base64");
        a_resp.locals.nonce = nonce;
        a_resp.setHeader("Content-Security-Policy", `script-src 'nonce-${nonce}' auth.globus.org`);
        a_resp.render("register", {
            nonce: a_resp.locals.nonce,
            uid: a_req.session.uid,
            uname: clean,
            theme: theme,
            version: g_version,
            test_mode: g_test,
            ...g_google_analytics,
        });
    }
});

/* This is the "login/register" URL from welcome page.
User should be unknown at this point (if session were valid, would be redirected to /ui/main).
This is the beginning of the OAuth loop through Globus Auth and will redirect to /ui/authn
*/
app.get("/ui/login", (a_req, a_resp) => {
    if (a_req.session.uid && a_req.session.reg) {
        a_resp.redirect("/ui/main");
    } else {
        logger.info(
            "/ui/login",
            getCurrentLineNumber(),
            "User (" + a_req.session.uid + ") from " + a_req.connection.remoteAddress + "log-in",
        );

        var uri = g_globus_auth.code.getUri();
        a_resp.redirect(uri);
    }
});

app.get("/ui/logout", (a_req, a_resp) => {
    logger.info(
        "/ui/logout",
        getCurrentLineNumber(),
        "User (" + a_req.session.uid + ") from " + a_req.connection.remoteAddress + " logout",
    );

    //a_resp.clearCookie( 'datafed-id' );
    //a_resp.clearCookie( 'datafed-user', { path: "/ui" } );
    a_req.session.destroy(function () {
        a_resp.clearCookie("connect.sid");
        a_resp.redirect(
            "https://auth.globus.org/v2/web/logout?redirect_name=DataFed&redirect_uri=" +
                g_extern_url,
        );
    });
});

app.get("/ui/error", (a_req, a_resp) => {
    const nonce = crypto.randomBytes(16).toString("base64");
    a_resp.locals.nonce = nonce;
    a_resp.setHeader("Content-Security-Policy", `script-src 'nonce-${nonce}'`);
    a_resp.render("error", {
        nonce: a_resp.locals.nonce,
        theme: "light",
        version: g_version,
        test_mode: g_test,
        ...g_google_analytics,
    });
});

/* This is the OAuth redirect URL after a user authenticates with Globus
 */
app.get("/ui/authn", (a_req, a_resp) => {
    logger.info("/ui/authn", getCurrentLineNumber(), "Globus authenticated - log in to DataFed");

    /* This after Globus authentication. Loads Globus tokens and identity information.
The user is then checked in DataFed and, if present redirected to the main page; otherwise, sent to
the registration page.
*/

    g_globus_auth.code.getToken(a_req.originalUrl).then(
        function (client_token) {
            let token_handler;
            try {
                token_handler = new OAuthTokenHandler(client_token);
            } catch (err) {
                a_resp.redirect("/ui/error");
                logger.error("/ui/authn", getCurrentLineNumber(), err);
                throw err;
            }
            let xfr_token = token_handler.extractTransferToken();

            const opts = {
                hostname: "auth.globus.org",
                method: "POST",
                path: "/v2/oauth2/token/introspect",
                rejectUnauthorized: true,
                auth: g_oauth_credentials.clientId + ":" + g_oauth_credentials.clientSecret,
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    Accept: "application/json",
                },
            };

            // Request user info from token
            const req = https.request(opts, (res) => {
                var data = "";

                res.on("data", (chunk) => {
                    data += chunk;
                });

                res.on("end", () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        const userinfo = JSON.parse(data);
                        const uid = userinfo.username.substring(0, userinfo.username.indexOf("@"));

                        logger.info(
                            "/ui/authn",
                            getCurrentLineNumber(),
                            "User: " + uid + " authenticated, verifying DataFed account",
                        );
                        sendMessageDirect(
                            "UserFindByUUIDsRequest",
                            "datafed-ws",
                            { uuid: userinfo.identities_set },
                            function (reply) {
                                if (!reply) {
                                    logger.error(
                                        "/ui/authn",
                                        getCurrentLineNumber(),
                                        "Error - Find user call failed.",
                                    );
                                    a_resp.redirect("/ui/error");
                                } else if (!reply.user || !reply.user.length) {
                                    // Not registered
                                    logger.info(
                                        "/ui/authn",
                                        getCurrentLineNumber(),
                                        "User: " + uid + "not registered",
                                    );

                                    if (
                                        token_handler.getTokenType() ===
                                        AccessTokenType.GLOBUS_TRANSFER
                                    ) {
                                        // Log error and do not register user in case of non-auth token
                                        logger.error(
                                            "/ui/authn",
                                            getCurrentLineNumber(),
                                            "Transfer token received for non-existent user.",
                                        );
                                        a_resp.redirect("/ui/error");
                                    }

                                    // Store all data need for registration in session (temporarily)
                                    a_req.session.uid = uid;
                                    a_req.session.name = userinfo.name;
                                    a_req.session.email = userinfo.email;
                                    a_req.session.uuids = userinfo.identities_set;
                                    a_req.session.acc_tok = xfr_token.access_token;
                                    a_req.session.acc_tok_ttl = xfr_token.expires_in;
                                    a_req.session.ref_tok = xfr_token.refresh_token;

                                    a_resp.redirect("/ui/register");
                                } else {
                                    logger.info(
                                        "/ui/authn",
                                        getCurrentLineNumber(),
                                        "User: " +
                                            uid +
                                            " verified, acc:" +
                                            xfr_token.access_token +
                                            ", ref: " +
                                            xfr_token.refresh_token +
                                            ", exp:" +
                                            xfr_token.expires_in,
                                    );

                                    // Store only data needed for active session
                                    a_req.session.uid = uid;
                                    a_req.session.reg = true;

                                    let redirect_path = "/ui/main";

                                    // Note: context/optional params for arbitrary input
                                    const token_context = {
                                        // passed values are mutable
                                        resource_server: client_token.data.resource_sever,
                                        collection_id: a_req.session.collection_id,
                                        scope: xfr_token.scope,
                                    };
                                    try {
                                        const optional_data =
                                            token_handler.constructOptionalData(token_context);

                                        // Refresh Globus access & refresh tokens to Core/DB
                                        // NOTE: core services seem entirely in charge of refreshing tokens once they are set (ClientWorker.cpp).
                                        // This should only be triggered when new tokens are coming in, like when a token expires or a transfer token is created.
                                        setAccessToken(
                                            a_req.session.uid,
                                            xfr_token.access_token,
                                            xfr_token.refresh_token,
                                            xfr_token.expires_in,
                                            optional_data,
                                        );
                                    } catch (err) {
                                        redirect_path = "/ui/error";
                                        logger.error("/ui/authn", getCurrentLineNumber(), err);
                                        delete a_req.session.collection_id;
                                    }

                                    // TODO Account may be disable from SDMS (active = false)
                                    a_resp.redirect(redirect_path);
                                }
                            },
                        );
                    } else {
                        // TODO - Not sure this is required - req.on('error'...) should catch this?
                        logger.error(
                            "ui/authn",
                            getCurrentLineNumber(),
                            "Error: Globus introspection failed. User token:",
                            xfr_token,
                        );
                        a_resp.redirect("/ui/error");
                    }
                });
            });

            req.on("error", (e) => {
                logger.error(
                    "ui/authn",
                    getCurrentLineNumber(),
                    "Error: Globus introspection failed. User token:",
                    xfr_token,
                );
                a_resp.redirect("/ui/error");
            });

            req.write("token=" + client_token.accessToken + "&include=identities_set");
            req.end();
        },
        function (reason) {
            logger.error(
                "ui/authn",
                getCurrentLineNumber(),
                "Error: Globus get token failed. Reason:",
                reason,
            );
            a_resp.redirect("/ui/error");
        },
    );
});

app.get("/api/usr/register", (a_req, a_resp) => {
    logger.debug("/api/usr/register", getCurrentLineNumber(), "Starting register.");

    if (!a_req.session.uid) {
        logger.error("/api/usr/register", getCurrentLineNumber(), "Error: not authenticated.");
        throw "Error: not authenticated.";
    } else if (a_req.session.reg) {
        logger.error("/api/usr/register", getCurrentLineNumber(), "Already registered");
        throw "Error: already registered.";
    } else {
        logger.info(
            "/api/usr/register",
            getCurrentLineNumber(),
            "Registering user" + a_req.session.uid,
        );

        sendMessageDirect(
            "UserCreateRequest",
            "",
            {
                uid: a_req.session.uid,
                password: a_req.query.pw,
                name: a_req.session.name,
                email: a_req.session.email,
                uuid: a_req.session.uuids,
                secret: g_system_secret,
            },
            function (reply) {
                if (!reply) {
                    logger.error(
                        "/api/usr/register",
                        getCurrentLineNumber(),
                        "Error: user registration failed - empty reply from server",
                    );
                    a_resp.status(500).send("Empty reply from server");
                } else if (reply.errCode) {
                    if (reply.errMsg) {
                        logger.error(
                            "/api/usr/register",
                            getCurrentLineNumber(),
                            "Error: user registration failed - ",
                            reply.errMsg,
                        );
                        a_resp.status(500).send(reply.errMsg);
                    } else {
                        logger.error(
                            "/api/usr/register",
                            getCurrentLineNumber(),
                            "Error: user registration failed - code:",
                            reply.errCode,
                        );
                        a_resp.status(500).send("Error code: " + reply.errCode);
                    }
                } else {
                    // Save access token
                    try {
                        setAccessToken(
                            a_req.session.uid,
                            a_req.session.acc_tok,
                            a_req.session.ref_tok,
                            a_req.session.acc_tok_ttl,
                        );
                    } catch (err) {
                        logger.error("/api/usr/register", getCurrentLineNumber(), err);
                        throw err;
                    } finally {
                        // Remove data not needed for active session
                        delete a_req.session.name;
                        delete a_req.session.email;
                        delete a_req.session.uuids;
                        delete a_req.session.acc_tok;
                        delete a_req.session.acc_tok_ttl;
                        delete a_req.session.ref_tok;
                        delete a_req.session.uuids;
                    }

                    // Set session as registered user
                    a_req.session.reg = true;

                    a_resp.send(reply);
                }
            },
        );
    }
});

app.get("/api/msg/daily", (a_req, a_resp) => {
    sendMessageDirect("DailyMessageRequest", null, {}, function (reply) {
        a_resp.json(reply);
    });
});

app.get("/api/usr/find/by_uuids", (a_req, a_resp) => {
    sendMessage(
        "UserFindByUUIDsRequest",
        { uuid: a_req.query.uuids },
        a_req,
        a_resp,
        function (reply) {
            a_resp.json(reply.user[0]);
        },
    );
});

app.get("/api/usr/find/by_name_uid", (a_req, a_resp) => {
    var par = { nameUid: a_req.query.name_uid };
    if (a_req.query.offset != undefined && a_req.query.count != undefined) {
        par.offset = a_req.query.offset;
        par.count = a_req.query.count;
    }

    sendMessage("UserFindByNameUIDRequest", par, a_req, a_resp, function (reply) {
        a_resp.send(reply);
    });
});

app.get("/api/usr/view", (a_req, a_resp) => {
    sendMessage(
        "UserViewRequest",
        { uid: a_req.query.id, details: a_req.query.details == "true" ? true : false },
        a_req,
        a_resp,
        function (reply) {
            a_resp.json(reply.user[0]);
        },
    );
});

app.get("/api/usr/update", (a_req, a_resp) => {
    var params = { uid: a_req.query.uid };
    if (a_req.query.email != undefined) params.email = a_req.query.email;
    if (a_req.query.pw != undefined) params.password = a_req.query.pw;
    if (a_req.query.opts != undefined) {
        params.options = a_req.query.opts;
    }

    sendMessage("UserUpdateRequest", params, a_req, a_resp, function (reply) {
        a_resp.json(reply.user[0]);
    });
});

app.get("/api/usr/revoke_cred", (a_req, a_resp) => {
    sendMessage("RevokeCredentialsRequest", {}, a_req, a_resp, function (reply) {
        a_resp.json({});
    });
});

app.get("/api/usr/list/all", (a_req, a_resp) => {
    var par = {};
    if (a_req.query.offset != undefined && a_req.query.count != undefined) {
        par.offset = a_req.query.offset;
        par.count = a_req.query.count;
    }

    sendMessage("UserListAllRequest", par, a_req, a_resp, function (reply) {
        a_resp.json(reply);
    });
});

app.get("/api/usr/list/collab", (a_req, a_resp) => {
    var par = {};
    if (a_req.query.offset != undefined && a_req.query.count != undefined) {
        par.offset = a_req.query.offset;
        par.count = a_req.query.count;
    }

    sendMessage("UserListCollabRequest", par, a_req, a_resp, function (reply) {
        a_resp.json(reply);
    });
});

app.post("/api/prj/create", (a_req, a_resp) => {
    sendMessage("ProjectCreateRequest", a_req.body, a_req, a_resp, function (reply) {
        if (reply.proj) a_resp.send(reply.proj);
        else a_resp.send([]);
    });
});

app.post("/api/prj/update", (a_req, a_resp) => {
    sendMessage("ProjectUpdateRequest", a_req.body, a_req, a_resp, function (reply) {
        if (reply.proj) a_resp.send(reply.proj);
        else a_resp.send([]);
    });
});

app.get("/api/prj/delete", (a_req, a_resp) => {
    sendMessage(
        "ProjectDeleteRequest",
        { id: JSON.parse(a_req.query.ids) },
        a_req,
        a_resp,
        function (reply) {
            a_resp.send(reply);
        },
    );
});

app.get("/api/prj/view", (a_req, a_resp) => {
    sendMessage("ProjectViewRequest", { id: a_req.query.id }, a_req, a_resp, function (reply) {
        if (reply.proj && reply.proj.length) a_resp.send(reply.proj[0]);
        else a_resp.send();
    });
});

app.get("/api/prj/list", (a_req, a_resp) => {
    var params = {};
    if (a_req.query.owner != undefined) params.asOwner = a_req.query.owner == "true" ? true : false;
    if (a_req.query.admin != undefined) params.asAdmin = a_req.query.admin == "true" ? true : false;
    if (a_req.query.member != undefined)
        params.asMember = a_req.query.member == "true" ? true : false;
    if (a_req.query.sort != undefined) params.sort = a_req.query.sort;
    if (a_req.query.offset != undefined && a_req.query.count != undefined) {
        params.offset = a_req.query.offset;
        params.count = a_req.query.count;
    }

    sendMessage("ProjectListRequest", params, a_req, a_resp, function (reply) {
        a_resp.send(reply);
    });
});

app.post("/api/prj/search", (a_req, a_resp) => {
    sendMessage("ProjectSearchRequest", a_req.body, a_req, a_resp, function (reply) {
        a_resp.send(reply.item ? reply.item : []);
    });
});

app.get("/api/grp/create", (a_req, a_resp) => {
    var params = {
        group: {
            uid: a_req.query.uid,
            gid: a_req.query.gid,
        },
    };

    if (a_req.query.title != undefined) params.group.title = a_req.query.title;
    if (a_req.query.desc != undefined) params.group.desc = a_req.query.desc;
    if (a_req.query.member != undefined) params.group.member = JSON.parse(a_req.query.member);

    sendMessage("GroupCreateRequest", params, a_req, a_resp, function (reply) {
        a_resp.send(reply.group[0]);
    });
});

app.get("/api/grp/update", (a_req, a_resp) => {
    var params = {
        uid: a_req.query.uid,
        gid: a_req.query.gid,
    };

    if (a_req.query.title != undefined) params.title = a_req.query.title;
    if (a_req.query.desc != undefined) params.desc = a_req.query.desc;
    if (a_req.query.add != undefined) params.addUid = JSON.parse(a_req.query.add);
    if (a_req.query.rem != undefined) params.remUid = JSON.parse(a_req.query.rem);

    sendMessage("GroupUpdateRequest", params, a_req, a_resp, function (reply) {
        a_resp.send(reply.group[0]);
    });
});

app.get("/api/grp/view", (a_req, a_resp) => {
    sendMessage(
        "GroupViewRequest",
        { uid: a_req.query.uid, gid: a_req.query.gid },
        a_req,
        a_resp,
        function (reply) {
            a_resp.send(reply);
        },
    );
});

app.get("/api/grp/list", (a_req, a_resp) => {
    sendMessage("GroupListRequest", { uid: a_req.query.uid }, a_req, a_resp, function (reply) {
        a_resp.send(reply.group ? reply.group : []);
    });
});

app.get("/api/grp/delete", (a_req, a_resp) => {
    sendMessage(
        "GroupDeleteRequest",
        { uid: a_req.query.uid, gid: a_req.query.gid },
        a_req,
        a_resp,
        function (reply) {
            a_resp.send(reply);
        },
    );
});

app.get("/api/query/list", (a_req, a_resp) => {
    var par = {};
    if (a_req.query.offset != undefined && a_req.query.count != undefined) {
        par.offset = a_req.query.offset;
        par.count = a_req.query.count;
    }

    sendMessage("QueryListRequest", par, a_req, a_resp, function (reply) {
        a_resp.send(reply.item ? reply.item : []);
    });
});

app.post("/api/query/create", (a_req, a_resp) => {
    sendMessage(
        "QueryCreateRequest",
        { title: a_req.query.title, query: a_req.body },
        a_req,
        a_resp,
        function (reply) {
            a_resp.send(reply);
        },
    );
});

app.post("/api/query/update", (a_req, a_resp) => {
    var params = { id: a_req.query.id };
    if (a_req.query.title) params.title = a_req.query.title;
    if (a_req.body) params.query = a_req.body;

    sendMessage("QueryUpdateRequest", params, a_req, a_resp, function (reply) {
        a_resp.send(reply);
    });
});

app.get("/api/query/delete", (a_req, a_resp) => {
    sendMessage(
        "QueryDeleteRequest",
        { id: JSON.parse(a_req.query.ids) },
        a_req,
        a_resp,
        function (reply) {
            a_resp.send(reply);
        },
    );
});

app.get("/api/query/view", (a_req, a_resp) => {
    sendMessage("QueryViewRequest", { id: a_req.query.id }, a_req, a_resp, function (reply) {
        a_resp.send(reply);
    });
});

app.get("/api/query/exec", (a_req, a_resp) => {
    var msg = {
        id: a_req.query.id,
    };

    if (a_req.query.offset != undefined && a_req.query.count != undefined) {
        msg.offset = a_req.query.offset;
        msg.count = a_req.query.count;
    }

    sendMessage("QueryExecRequest", msg, a_req, a_resp, function (reply) {
        a_resp.send(reply);
    });
});

app.post("/api/dat/search", (a_req, a_resp) => {
    sendMessage("SearchRequest", a_req.body, a_req, a_resp, function (reply) {
        a_resp.send(reply);
    });
});

app.post("/api/dat/create", (a_req, a_resp) => {
    sendMessage("RecordCreateRequest", a_req.body, a_req, a_resp, function (reply) {
        a_resp.send(reply);
    });
});

app.post("/api/dat/create/batch", (a_req, a_resp) => {
    sendMessage(
        "RecordCreateBatchRequest",
        { records: a_req.body },
        a_req,
        a_resp,
        function (reply) {
            a_resp.send(reply);
        },
    );
});

app.post("/api/dat/update", (a_req, a_resp) => {
    sendMessage("RecordUpdateRequest", a_req.body, a_req, a_resp, function (reply) {
        if (reply.data && reply.data.length) {
            logger.debug(
                "/api/dat/update",
                getCurrentLineNumber(),
                "User: " + a_req.session.uid + " - data update, id: " + reply.data[0].id,
            );
        }
        a_resp.send(reply);
    });
});

app.post("/api/dat/update/batch", (a_req, a_resp) => {
    sendMessage(
        "RecordUpdateBatchRequest",
        { records: a_req.body },
        a_req,
        a_resp,
        function (reply) {
            a_resp.send(reply);
        },
    );
});

app.get("/api/dat/lock", (a_req, a_resp) => {
    sendMessage(
        "RecordLockRequest",
        { id: JSON.parse(a_req.query.ids), lock: a_req.query.lock == "true" ? true : false },
        a_req,
        a_resp,
        function (reply) {
            a_resp.send(reply);
        },
    );
});

app.get("/api/dat/lock/toggle", (a_req, a_resp) => {
    sendMessage("RecordLockToggleRequest", { id: a_req.query.id }, a_req, a_resp, function (reply) {
        a_resp.send(reply);
    });
});

app.get("/api/dat/copy", (a_req, a_resp) => {
    var params = {
        sourceId: a_req.query.src,
        destId: a_req.query.dst,
    };

    sendMessage("DataCopyRequest", params, a_req, a_resp, function (reply) {
        a_resp.send(reply);
    });
});

app.get("/api/dat/delete", (a_req, a_resp) => {
    sendMessage(
        "RecordDeleteRequest",
        { id: JSON.parse(a_req.query.ids) },
        a_req,
        a_resp,
        function (reply) {
            a_resp.send(reply);
        },
    );
});

app.get("/api/dat/view", (a_req, a_resp) => {
    sendMessage("RecordViewRequest", { id: a_req.query.id }, a_req, a_resp, function (reply) {
        if (reply.data && reply.data.length) a_resp.send(reply);
        else a_resp.send();
    });
});

app.get("/api/dat/export", (a_req, a_resp) => {
    sendMessage(
        "RecordExportRequest",
        { id: JSON.parse(a_req.query.ids) },
        a_req,
        a_resp,
        function (reply) {
            a_resp.send(reply);
        },
    );
});

app.get("/api/dat/list/by_alloc", (a_req, a_resp) => {
    var par = {
        repo: a_req.query.repo,
        subject: a_req.query.subject,
    };
    if (a_req.query.offset != undefined && a_req.query.count != undefined) {
        par.offset = a_req.query.offset;
        par.count = a_req.query.count;
    }

    sendMessage("RecordListByAllocRequest", par, a_req, a_resp, function (reply) {
        a_resp.send(reply);
    });
});

app.get("/api/dat/get", (a_req, a_resp) => {
    var par = { id: JSON.parse(a_req.query.id) };

    if (a_req.query.path) par.path = a_req.query.path;

    if (a_req.query.encrypt != undefined) par.encrypt = a_req.query.encrypt;

    if (a_req.query.orig_fname) par.origFname = true;

    if (a_req.query.check) par.check = a_req.query.check;

    const { collection_id, collection_type } = a_req.query;
    par.collectionId = collection_id;
    par.collectionType = collection_type;

    sendMessage("DataGetRequest", par, a_req, a_resp, function (reply) {
        a_resp.send(reply);
    });
});

app.get("/api/dat/put", (a_req, a_resp) => {
    var par = { id: a_req.query.id };

    if (a_req.query.path) par.path = a_req.query.path;

    if (a_req.query.encrypt != undefined) par.encrypt = a_req.query.encrypt;

    if (a_req.query.ext) par.ext = a_req.query.ext;

    if (a_req.query.check) par.check = a_req.query.check;

    const { collection_id, collection_type } = a_req.query;
    par.collectionId = collection_id;
    par.collectionType = collection_type;

    sendMessage("DataPutRequest", par, a_req, a_resp, function (reply) {
        a_resp.send(reply);
    });
});

app.get("/api/dat/dep/get", (a_req, a_resp) => {
    sendMessage(
        "RecordGetDependenciesRequest",
        { id: a_req.query.ids },
        a_req,
        a_resp,
        function (reply) {
            a_resp.send(reply);
        },
    );
});

app.get("/api/dat/dep/graph/get", (a_req, a_resp) => {
    sendMessage(
        "RecordGetDependencyGraphRequest",
        { id: a_req.query.id },
        a_req,
        a_resp,
        function (reply) {
            a_resp.send(reply);
        },
    );
});

app.get("/api/dat/alloc_chg", (a_req, a_resp) => {
    var params = { id: JSON.parse(a_req.query.id) };
    if (a_req.query.repo_id) params.repoId = a_req.query.repo_id;
    if (a_req.query.proj_id) params.projId = a_req.query.proj_id;
    if (a_req.query.check) params.check = true;

    sendMessage("RecordAllocChangeRequest", params, a_req, a_resp, function (reply) {
        a_resp.send(reply);
    });
});

app.get("/api/dat/owner_chg", (a_req, a_resp) => {
    var params = { id: JSON.parse(a_req.query.id), collId: a_req.query.coll_id };
    if (a_req.query.repo_id) params.repoId = a_req.query.repo_id;
    if (a_req.query.proj_id) params.projId = a_req.query.proj_id;
    if (a_req.query.check) params.check = true;

    sendMessage("RecordOwnerChangeRequest", params, a_req, a_resp, function (reply) {
        a_resp.send(reply);
    });
});

app.post("/api/metadata/validate", (a_req, a_resp) => {
    sendMessage("MetadataValidateRequest", a_req.body, a_req, a_resp, function (reply) {
        a_resp.send(reply);
    });
});

app.get("/api/perms/check", (a_req, a_resp) => {
    var params = { id: a_req.query.id };
    if (a_req.query.perms != undefined) params.perms = a_req.query.perms;
    if (a_req.query.any != undefined) params.any = a_req.query.any;
    sendMessage("CheckPermsRequest", params, a_req, a_resp, function (reply) {
        a_resp.send(reply);
    });
});

app.get("/api/perms/get", (a_req, a_resp) => {
    var params = { id: a_req.query.id };
    if (a_req.query.perms != undefined) params.perms = a_req.query.perms;
    sendMessage("GetPermsRequest", params, a_req, a_resp, function (reply) {
        a_resp.send(reply);
    });
});

app.get("/api/acl/view", (a_req, a_resp) => {
    sendMessage("ACLViewRequest", { id: a_req.query.id }, a_req, a_resp, function (reply) {
        a_resp.send(reply);
    });
});

app.get("/api/acl/update", (a_req, a_resp) => {
    sendMessage(
        "ACLUpdateRequest",
        { id: a_req.query.id, rules: a_req.query.rules },
        a_req,
        a_resp,
        function (reply) {
            if (reply.rule && reply.rule.length) {
                logger.debug(
                    "/api/acl/update",
                    getCurrentLineNumber(),
                    "User: " +
                        a_req.session.uid +
                        " - ACL update, id: " +
                        a_req.query.id +
                        " " +
                        a_req.query.rules,
                );
            }
            a_resp.send(reply);
        },
    );
});

app.get("/api/acl/shared/list", (a_req, a_resp) => {
    sendMessage(
        "ACLSharedListRequest",
        {
            incUsers: a_req.query.inc_users ? true : false,
            incProjects: a_req.query.inc_projects ? true : false,
        },
        a_req,
        a_resp,
        function (reply) {
            a_resp.send(reply);
        },
    );
});

app.get("/api/acl/shared/list/items", (a_req, a_resp) => {
    sendMessage(
        "ACLSharedListItemsRequest",
        { owner: a_req.query.owner },
        a_req,
        a_resp,
        function (reply) {
            a_resp.send(reply);
        },
    );
});

app.get("/api/note/create", (a_req, a_resp) => {
    var params = {
        type: a_req.query.type,
        subject: a_req.query.subject,
        title: a_req.query.title,
        comment: a_req.query.comment,
        activate: a_req.query.activate,
    };

    sendMessage("NoteCreateRequest", params, a_req, a_resp, function (reply) {
        a_resp.send(reply);
    });
});

app.get("/api/note/update", (a_req, a_resp) => {
    var params = {
        id: a_req.query.id,
        comment: a_req.query.comment,
    };

    if (a_req.query.new_type) params.newType = a_req.query.new_type;

    if (a_req.query.new_state) params.newState = a_req.query.new_state;

    if (a_req.query.new_title) params.newTitle = a_req.query.new_title;

    sendMessage("NoteUpdateRequest", params, a_req, a_resp, function (reply) {
        a_resp.send(reply);
    });
});

app.get("/api/note/comment/edit", (a_req, a_resp) => {
    var params = {
        id: a_req.query.id,
        comment: a_req.query.comment,
        commentIdx: a_req.query.comment_idx,
    };

    sendMessage("NoteCommentEditRequest", params, a_req, a_resp, function (reply) {
        a_resp.send(reply);
    });
});

app.get("/api/note/view", (a_req, a_resp) => {
    sendMessage("NoteViewRequest", { id: a_req.query.id }, a_req, a_resp, function (reply) {
        a_resp.send(reply);
    });
});

app.get("/api/note/list/by_subject", (a_req, a_resp) => {
    sendMessage(
        "NoteListBySubjectRequest",
        { subject: a_req.query.subject },
        a_req,
        a_resp,
        function (reply) {
            a_resp.send(reply);
        },
    );
});

app.get("/api/tag/search", (a_req, a_resp) => {
    var par = { name: a_req.query.name };
    if (a_req.query.offset != undefined && a_req.query.count != undefined) {
        par.offset = a_req.query.offset;
        par.count = a_req.query.count;
    }

    sendMessage("TagSearchRequest", par, a_req, a_resp, function (reply) {
        a_resp.json(reply);
    });
});

app.get("/api/tag/autocomp", (a_req, a_resp) => {
    var par = { name: a_req.query.term, offset: 0, count: 20 };

    sendMessage("TagSearchRequest", par, a_req, a_resp, function (reply) {
        var res = [],
            tag;
        if (reply.tag) {
            for (var i in reply.tag) {
                tag = reply.tag[i];
                res.push({ value: tag.name, label: tag.name + " (" + tag.count + ")" });
            }
        }

        a_resp.json(res);
    });
});

// TODO This doesn't seem to be used anymore
app.get("/api/tag/list/by_count", (a_req, a_resp) => {
    var par = {};
    if (a_req.query.offset != undefined && a_req.query.count != undefined) {
        par.offset = a_req.query.offset;
        par.count = a_req.query.count;
    }

    sendMessage("TagListByCountRequest", par, a_req, a_resp, function (reply) {
        a_resp.json(reply);
    });
});

app.get("/api/task/list", (a_req, a_resp) => {
    var params = {};
    if (a_req.query.since) params.since = a_req.query.since;
    sendMessage("TaskListRequest", params, a_req, a_resp, function (reply) {
        a_resp.json(reply);
    });
});

app.get("/api/task/view", (a_req, a_resp) => {
    sendMessage("TaskViewRequest", { taskId: a_req.query.id }, a_req, a_resp, function (reply) {
        a_resp.json(reply);
    });
});

app.post("/api/col/create", (a_req, a_resp) => {
    sendMessage("CollCreateRequest", a_req.body, a_req, a_resp, function (reply) {
        a_resp.send(reply);
    });
});

app.post("/api/col/update", (a_req, a_resp) => {
    sendMessage("CollUpdateRequest", a_req.body, a_req, a_resp, function (reply) {
        a_resp.send(reply);
    });
});

app.get("/api/col/delete", (a_req, a_resp) => {
    sendMessage(
        "CollDeleteRequest",
        { id: JSON.parse(a_req.query.ids) },
        a_req,
        a_resp,
        function (reply) {
            a_resp.send(reply);
        },
    );
});

app.get("/api/col/view", (a_req, a_resp) => {
    sendMessage("CollViewRequest", { id: a_req.query.id }, a_req, a_resp, function (reply) {
        if (reply.coll && reply.coll.length) {
            a_resp.send(reply.coll[0]);
        } else {
            a_resp.send();
        }
    });
});

app.get("/api/col/read", (a_req, a_resp) => {
    var par = { id: a_req.query.id };
    if (a_req.query.offset != undefined && a_req.query.count != undefined) {
        par.offset = a_req.query.offset;
        par.count = a_req.query.count;
    }
    sendMessage("CollReadRequest", par, a_req, a_resp, function (reply) {
        a_resp.send(reply);
    });
});

app.get("/api/col/get_parents", (a_req, a_resp) => {
    sendMessage("CollGetParentsRequest", { id: a_req.query.id }, a_req, a_resp, function (reply) {
        a_resp.send(reply);
    });
});

app.get("/api/col/get_offset", (a_req, a_resp) => {
    sendMessage(
        "CollGetOffsetRequest",
        { id: a_req.query.id, item: a_req.query.item_id, pageSz: a_req.query.page_sz },
        a_req,
        a_resp,
        function (reply) {
            a_resp.send(reply);
        },
    );
});

app.get("/api/col/move", (a_req, a_resp) => {
    sendMessage(
        "CollMoveRequest",
        {
            srcId: a_req.query.src_id,
            dstId: a_req.query.dst_id,
            item: JSON.parse(a_req.query.items),
        },
        a_req,
        a_resp,
        function (reply) {
            a_resp.send(reply);
        },
    );
});

app.get("/api/col/link", (a_req, a_resp) => {
    sendMessage(
        "CollWriteRequest",
        { id: a_req.query.coll, add: JSON.parse(a_req.query.items) },
        a_req,
        a_resp,
        function (reply) {
            a_resp.send(reply);
        },
    );
});

app.get("/api/col/unlink", (a_req, a_resp) => {
    sendMessage(
        "CollWriteRequest",
        { id: a_req.query.coll, rem: JSON.parse(a_req.query.items) },
        a_req,
        a_resp,
        function (reply) {
            a_resp.send(reply);
        },
    );
});

app.get("/api/col/published/list", (a_req, a_resp) => {
    var par = { subject: a_req.query.subject };
    if (a_req.query.offset != undefined && a_req.query.count != undefined) {
        par.offset = a_req.query.offset;
        par.count = a_req.query.count;
    }

    sendMessage("CollListPublishedRequest", par, a_req, a_resp, function (reply) {
        a_resp.send(reply);
    });
});

app.post("/api/cat/search", (a_req, a_resp) => {
    sendMessage("CatalogSearchRequest", a_req.body, a_req, a_resp, function (reply) {
        a_resp.send(reply);
    });
});

app.get("/api/globus/consent_url", storeCollectionId, (a_req, a_resp) => {
    const { requested_scopes, state, refresh_tokens, query_params } = a_req.query;

    const consent_url = generateConsentURL(
        g_oauth_credentials.clientId,
        g_oauth_credentials.redirectUri,
        refresh_tokens,
        requested_scopes,
        query_params,
        state,
    );

    a_resp.json({ consent_url });
});

app.post("/api/col/pub/search/data", (a_req, a_resp) => {
    sendMessage("RecordSearchPublishedRequest", a_req.body, a_req, a_resp, function (reply) {
        a_resp.send(reply);
    });
});

app.get("/api/repo/list", (a_req, a_resp) => {
    var params = {};
    if (a_req.query.all) params.all = a_req.query.all;
    if (a_req.query.details) params.details = a_req.query.details;
    sendMessage("RepoListRequest", params, a_req, a_resp, function (reply) {
        a_resp.json(reply.repo ? reply.repo : []);
    });
});

app.get("/api/repo/view", (a_req, a_resp) => {
    sendMessage("RepoViewRequest", { id: a_req.query.id }, a_req, a_resp, function (reply) {
        a_resp.json(reply.repo ? reply.repo : []);
    });
});

app.post("/api/repo/create", (a_req, a_resp) => {
    sendMessage("RepoCreateRequest", a_req.body, a_req, a_resp, function (reply) {
        a_resp.json({});
    });
});

app.post("/api/repo/update", (a_req, a_resp) => {
    sendMessage("RepoUpdateRequest", a_req.body, a_req, a_resp, function (reply) {
        a_resp.json({});
    });
});

app.get("/api/repo/delete", (a_req, a_resp) => {
    sendMessage("RepoDeleteRequest", { id: a_req.query.id }, a_req, a_resp, function (reply) {
        a_resp.json({});
    });
});

app.get("/api/repo/calc_size", (a_req, a_resp) => {
    sendMessage(
        "RepoCalcSizeRequest",
        {
            recurse: a_req.query.recurse == "true" ? true : false,
            item: JSON.parse(a_req.query.items),
        },
        a_req,
        a_resp,
        function (reply) {
            a_resp.send(reply);
        },
    );
});

app.get("/api/repo/alloc/list/by_repo", (a_req, a_resp) => {
    sendMessage(
        "RepoListAllocationsRequest",
        { id: a_req.query.id },
        a_req,
        a_resp,
        function (reply) {
            a_resp.json(reply.alloc ? reply.alloc : []);
        },
    );
});

app.get("/api/repo/alloc/list/by_subject", (a_req, a_resp) => {
    var par = {};
    if (a_req.query.subject != undefined) par.subject = a_req.query.subject;
    if (a_req.query.stats == "true") par.stats = true;

    sendMessage("RepoListSubjectAllocationsRequest", par, a_req, a_resp, function (reply) {
        a_resp.json(reply.alloc ? reply.alloc : []);
    });
});

app.get("/api/repo/alloc/list/by_object", (a_req, a_resp) => {
    sendMessage(
        "RepoListObjectAllocationsRequest",
        { id: a_req.query.id },
        a_req,
        a_resp,
        function (reply) {
            a_resp.json(reply.alloc ? reply.alloc : []);
        },
    );
});

app.get("/api/repo/alloc/view", (a_req, a_resp) => {
    sendMessage(
        "RepoViewAllocationRequest",
        { repo: a_req.query.repo, subject: a_req.query.subject },
        a_req,
        a_resp,
        function (reply) {
            a_resp.send(reply);
        },
    );
});

app.get("/api/repo/alloc/stats", (a_req, a_resp) => {
    sendMessage(
        "RepoAllocationStatsRequest",
        { repo: a_req.query.repo, subject: a_req.query.subject },
        a_req,
        a_resp,
        function (reply) {
            a_resp.json(reply.alloc ? reply.alloc : {});
        },
    );
});

app.get("/api/repo/alloc/create", (a_req, a_resp) => {
    sendMessage(
        "RepoAllocationCreateRequest",
        {
            repo: a_req.query.repo,
            subject: a_req.query.subject,
            dataLimit: a_req.query.data_limit,
            recLimit: a_req.query.rec_limit,
        },
        a_req,
        a_resp,
        function (reply) {
            a_resp.send(reply);
        },
    );
});

app.get("/api/repo/alloc/delete", (a_req, a_resp) => {
    sendMessage(
        "RepoAllocationDeleteRequest",
        { repo: a_req.query.repo, subject: a_req.query.subject },
        a_req,
        a_resp,
        function (reply) {
            a_resp.send(reply);
        },
    );
});

app.get("/api/repo/alloc/set", (a_req, a_resp) => {
    sendMessage(
        "RepoAllocationSetRequest",
        {
            repo: a_req.query.repo,
            subject: a_req.query.subject,
            dataLimit: a_req.query.data_limit,
            recLimit: a_req.query.rec_limit,
        },
        a_req,
        a_resp,
        function (reply) {
            a_resp.send(reply);
        },
    );
});

app.get("/api/repo/alloc/set/default", (a_req, a_resp) => {
    var par = { repo: a_req.query.repo };
    if (a_req.query.subject) par.subject = a_req.query.subject;

    sendMessage("RepoAllocationSetDefaultRequest", par, a_req, a_resp, function (reply) {
        a_resp.send(reply);
    });
});

app.get("/api/top/list/topics", (a_req, a_resp) => {
    var par = {};

    if (a_req.query.id) par.topicId = a_req.query.id;

    if (a_req.query.offset != undefined && a_req.query.count != undefined) {
        par.offset = a_req.query.offset;
        par.count = a_req.query.count;
    }

    sendMessage("TopicListTopicsRequest", par, a_req, a_resp, function (reply) {
        a_resp.json(reply);
    });
});

app.get("/api/top/list/coll", (a_req, a_resp) => {
    var par = { topicId: a_req.query.id };
    if (a_req.query.offset != undefined && a_req.query.count != undefined) {
        par.offset = a_req.query.offset;
        par.count = a_req.query.count;
    }

    sendMessage("TopicListCollectionsRequest", par, a_req, a_resp, function (reply) {
        a_resp.json(reply);
    });
});

app.get("/api/top/view", (a_req, a_resp) => {
    sendMessage("TopicViewRequest", { id: a_req.query.id }, a_req, a_resp, function (reply) {
        a_resp.json(reply);
    });
});

app.get("/api/top/search", (a_req, a_resp) => {
    sendMessage(
        "TopicSearchRequest",
        { phrase: a_req.query.phrase },
        a_req,
        a_resp,
        function (reply) {
            a_resp.json(reply);
        },
    );
});

app.get("/api/sch/view", (a_req, a_resp) => {
    sendMessage(
        "SchemaViewRequest",
        { id: a_req.query.id, resolve: a_req.query.resolve },
        a_req,
        a_resp,
        function (reply) {
            a_resp.json(reply);
        },
    );
});

app.post("/api/sch/search", (a_req, a_resp) => {
    sendMessage("SchemaSearchRequest", a_req.body, a_req, a_resp, function (reply) {
        a_resp.json(reply);
    });
});

app.post("/api/sch/create", (a_req, a_resp) => {
    sendMessage("SchemaCreateRequest", a_req.body, a_req, a_resp, function (reply) {
        a_resp.json(reply);
    });
});

app.post("/api/sch/revise", (a_req, a_resp) => {
    sendMessage("SchemaReviseRequest", a_req.body, a_req, a_resp, function (reply) {
        a_resp.json(reply);
    });
});

app.post("/api/sch/update", (a_req, a_resp) => {
    sendMessage("SchemaUpdateRequest", a_req.body, a_req, a_resp, function (reply) {
        a_resp.json(reply);
    });
});

app.post("/api/sch/delete", (a_req, a_resp) => {
    sendMessage("SchemaDeleteRequest", { id: a_req.query.id }, a_req, a_resp, function (reply) {
        a_resp.json(reply);
    });
});

app.get("/ui/ep/view", (a_req, a_resp) => {
    // TODO: include message data if needed
    sendMessage("UserGetAccessTokenRequest", {}, a_req, a_resp, function (reply) {
        const opts = {
            hostname: "transfer.api.globusonline.org",
            method: "GET",
            path: "/v0.10/endpoint/" + encodeURIComponent(a_req.query.ep),
            rejectUnauthorized: true,
            headers: {
                Authorization: " Bearer " + reply.access,
            },
        };

        const req = https.request(opts, (res) => {
            var data = "";

            res.on("data", (chunk) => {
                data += chunk;
            });
            res.on("end", () => {
                a_resp.json(JSON.parse(data));
            });
        });

        req.on("error", (e) => {
            a_resp.status(500);
            a_resp.send("Globus endpoint view failed.");
        });

        req.end();
    });
});

app.get("/ui/ep/autocomp", (a_req, a_resp) => {
    // TODO: include message data if needed
    sendMessage("UserGetAccessTokenRequest", {}, a_req, a_resp, function (reply) {
        const opts = {
            hostname: "transfer.api.globusonline.org",
            method: "GET",
            path:
                "/v0.10/endpoint_search?filter_scope=all&fields=display_name,canonical_name,id,description,organization,activated,expires_in,default_directory&filter_fulltext=" +
                encodeURIComponent(a_req.query.term),
            rejectUnauthorized: true,
            headers: {
                Authorization: " Bearer " + reply.access,
            },
        };

        const req = https.request(opts, (res) => {
            var data = "";

            res.on("data", (chunk) => {
                data += chunk;
            });

            res.on("end", () => {
                a_resp.json(JSON.parse(data));
            });
        });

        req.on("error", (e) => {
            a_resp.status(500);
            a_resp.send("Globus endpoint search failed.");
        });

        req.end();
    });
});

app.get("/ui/ep/recent/load", (a_req, a_resp) => {
    sendMessage("UserGetRecentEPRequest", {}, a_req, a_resp, function (reply) {
        a_resp.json(reply.ep ? reply.ep : []);
    });
});

app.post("/ui/ep/recent/save", (a_req, a_resp) => {
    sendMessage("UserSetRecentEPRequest", a_req.body, a_req, a_resp, function (reply) {
        a_resp.json({});
    });
});

app.get("/ui/ep/dir/list", (a_req, a_resp) => {
    const message_data = {
        collectionId: a_req.query.collection_id,
        collectionType: a_req.query.collection_type,
    };

    const get_from_globus_api = (token, original_reply) => {
        const opts = {
            hostname: "transfer.api.globusonline.org",
            method: "GET",
            path:
                "/v0.10/operation/endpoint/" +
                encodeURIComponent(a_req.query.ep) +
                "/ls?path=" +
                encodeURIComponent(a_req.query.path) +
                "&show_hidden=" +
                a_req.query.hidden,
            rejectUnauthorized: true,
            headers: {
                Authorization: " Bearer " + token,
            },
        };

        const req = https.request(opts, (res) => {
            var data = "";

            res.on("data", (chunk) => {
                data += chunk;
            });
            res.on("end", () => {
                let res_json = JSON.parse(data);
                res_json.needs_consent = original_reply.needsConsent;
                a_resp.json(res_json);
            });
        });

        req.on("error", (e) => {
            a_resp.status(500);
            a_resp.send("Globus endpoint directoy listing failed.");
        });

        req.end();
    };

    sendMessage("UserGetAccessTokenRequest", { ...message_data }, a_req, a_resp, function (reply) {
        if (reply.needsConsent) {
            sendMessage("UserGetAccessTokenRequest", {}, a_req, a_resp, (base_token_reply) => {
                get_from_globus_api(base_token_reply.access, reply);
            });
        }
        else {
            get_from_globus_api(reply.access, reply)
        }
    });
});

app.get("/ui/theme/load", (a_req, a_resp) => {
    var theme = a_req.cookies["datafed-theme"];
    a_resp.send(theme);
});

app.get("/ui/theme/save", (a_req, a_resp) => {
    a_resp.cookie("datafed-theme", a_req.query.theme, {
        httpOnly: true,
        path: "/ui",
        maxAge: 31536000000 /*1 year in msec */,
    });
    a_resp.send('{"ok":true}');
});

/** Puts message on ZeroMQ to set a user access token
 *
 * @param {string} a_uid - UID to which the access token belongs
 * @param {string} a_acc_tok - Access token to be associated with user
 * @param {string} a_ref_tok - Refresh token for access token
 * @param {number} a_expires_sec - Time until expiration of access token
 * @param {OptionalData} [token_optional_params] - Optional params for DataFed to process access token accordingly
 *
 * @throws Error - When a reply is not received from sendMessageDirect
 */
function setAccessToken(a_uid, a_acc_tok, a_ref_tok, a_expires_sec, token_optional_params = {}) {
    logger.info(
        setAccessToken.name,
        getCurrentLineNumber(),
        "setAccessToken uid: " + a_uid + " expires in: " + a_expires_sec,
    );
    let message_data = { access: a_acc_tok, refresh: a_ref_tok, expiresIn: a_expires_sec };
    if (token_optional_params && Object.keys(token_optional_params).length > 0) {
        message_data = { ...token_optional_params, ...message_data };
    }
    sendMessageDirect("UserSetAccessTokenRequest", a_uid, message_data, function (reply) {
        // Should be an AckReply
        if (!reply) {
            logger.error("setAccessToken", getCurrentLineNumber(), "failed.");
            throw new Error("setAccessToken failed");
        }
    });
}

function allocRequestContext(a_resp, a_callback) {
    var ctx = g_ctx_next;

    // At max ctx, must search for first free slot
    if (ctx == MAX_CTX) {
        ctx = g_ctx.indexOf(null);
        if (ctx == -1) {
            logger.critical(
                allocRequestContext.name,
                getCurrentLineNumber(),
                "ERROR: out of msg contexts!!!",
            );
            if (a_resp) {
                logger.error(allocRequestContext.name, getCurrentLineNumber(), "SEND FAIL");
                a_resp.status(503);
                a_resp.send("DataFed server busy.");
            }
        }
    }

    // Set next ctx value, or flag for search
    if (++g_ctx_next < MAX_CTX) {
        if (g_ctx[g_ctx_next]) g_ctx_next = MAX_CTX;
    }
    a_callback(ctx);
}

function sendMessage(a_msg_name, a_msg_data, a_req, a_resp, a_cb, a_anon) {
    var client = a_req.session.uid;
    if (!client) {
        logger.info(
            sendMessage.name,
            getCurrentLineNumber(),
            "NO AUTH :" + a_msg_name + ":" + a_req.connection.remoteAddress,
        );
        throw "Not Authenticated";
    }

    a_resp.setHeader("Content-Type", "application/json");

    allocRequestContext(a_resp, function (ctx) {
        var msg = g_msg_by_name[a_msg_name];
        if (!msg) throw "Invalid message type: " + a_msg_name;

        var msg_buf = msg.encode(a_msg_data).finish();

        var frame = Buffer.alloc(8);
        frame.writeUInt32BE(msg_buf.length, 0);
        frame.writeUInt8(msg._pid, 4);
        frame.writeUInt8(msg._mid, 5);
        frame.writeUInt16BE(ctx, 6);

        g_ctx[ctx] = function (a_reply) {
            if (!a_reply) {
                logger.error(
                    sendMessage.name,
                    getCurrentLineNumber(),
                    "Error - reply handler: empty reply",
                );
                a_resp.status(500).send("Empty reply");
            } else if (a_reply.errCode) {
                if (a_reply.errMsg) {
                    logger.error(
                        sendMessage.name,
                        getCurrentLineNumber(),
                        "Error - reply handler: " + a_reply.errMsg,
                    );
                    a_resp.status(500).send(a_reply.errMsg);
                } else {
                    logger.error(
                        sendMessage.name,
                        getCurrentLineNumber(),
                        "Error - reply handler: " + a_reply.errCode,
                    );
                    a_resp.status(500).send("error code: " + a_reply.errCode);
                }
            } else {
                a_cb(a_reply);
            }
        };

        var route_count = Buffer.alloc(4);
        route_count.writeUInt32BE(0, 0);
        if (msg_buf.length) {
            g_core_sock.send("BEGIN_DATAFED", zmq.ZMQ_SNDMORE);
            g_core_sock.send(route_count, zmq.ZMQ_SNDMORE);
            g_core_sock.send(nullfr, zmq.ZMQ_SNDMORE);
            const corr_id = uuidv4();
            g_core_sock.send(corr_id, zmq.ZMQ_SNDMORE);
            g_core_sock.send("no_key", zmq.ZMQ_SNDMORE);
            g_core_sock.send(client, zmq.ZMQ_SNDMORE);
            g_core_sock.send(frame, zmq.ZMQ_SNDMORE);
            g_core_sock.send(msg_buf);
            logger.debug(
                sendMessage.name,
                getCurrentLineNumber(),
                "MsgType is: " +
                    msg._msg_type +
                    " Writing ctx to frame, " +
                    ctx +
                    " buffer size " +
                    msg_buf.length,
                corr_id,
            );
        } else {
            g_core_sock.send("BEGIN_DATAFED", zmq.ZMQ_SNDMORE);
            g_core_sock.send(route_count, zmq.ZMQ_SNDMORE);
            g_core_sock.send(nullfr, zmq.ZMQ_SNDMORE);
            const corr_id = uuidv4();
            g_core_sock.send(corr_id, zmq.ZMQ_SNDMORE);
            g_core_sock.send("no_key", zmq.ZMQ_SNDMORE);
            g_core_sock.send(client, zmq.ZMQ_SNDMORE);
            g_core_sock.send(frame, zmq.ZMQ_SNDMORE);
            g_core_sock.send(nullfr);
            logger.debug(
                sendMessage.name,
                getCurrentLineNumber(),
                "MsgType is: " +
                    msg._msg_type +
                    " Writing ctx to frame, " +
                    ctx +
                    " buffer size " +
                    msg_buf.length,
                corr_id,
            );
        }
    });
}

function sendMessageDirect(a_msg_name, a_client, a_msg_data, a_cb) {
    var msg = g_msg_by_name[a_msg_name];
    if (!msg) throw "Invalid message type: " + a_msg_name;

    allocRequestContext(null, function (ctx) {
        var msg_buf = msg.encode(a_msg_data).finish();

        var frame = Buffer.alloc(8);
        // A protobuf message doesn't have to have a payload
        frame.writeUInt32BE(msg_buf.length, 0);
        frame.writeUInt8(msg._pid, 4);
        frame.writeUInt8(msg._mid, 5);
        frame.writeUInt16BE(ctx, 6);

        g_ctx[ctx] = a_cb;

        var route_count = Buffer.alloc(4);
        route_count.writeUInt32BE(0, 0);

        if (msg_buf.length) {
            // ZeroMQ socket g_core_sock - not Dale's code it is a library
            g_core_sock.send("BEGIN_DATAFED", zmq.ZMQ_SNDMORE);
            g_core_sock.send(route_count, zmq.ZMQ_SNDMORE);
            g_core_sock.send(nullfr, zmq.ZMQ_SNDMORE);
            const corr_id = uuidv4();
            g_core_sock.send(corr_id, zmq.ZMQ_SNDMORE);
            g_core_sock.send("no_key", zmq.ZMQ_SNDMORE);
            g_core_sock.send(a_client, zmq.ZMQ_SNDMORE);
            g_core_sock.send(frame, zmq.ZMQ_SNDMORE);
            g_core_sock.send(msg_buf);
            logger.debug(
                sendMessageDirect.name,
                getCurrentLineNumber(),
                "MsgType is: " +
                    msg._msg_type +
                    " Direct Writing ctx to frame, " +
                    ctx +
                    " buffer size " +
                    msg_buf.length,
                corr_id,
            );
        } else {
            g_core_sock.send("BEGIN_DATAFED", zmq.ZMQ_SNDMORE);
            g_core_sock.send(route_count, zmq.ZMQ_SNDMORE);
            g_core_sock.send(nullfr, zmq.ZMQ_SNDMORE);
            const corr_id = uuidv4();
            g_core_sock.send(corr_id, zmq.ZMQ_SNDMORE);
            g_core_sock.send("no_key", zmq.ZMQ_SNDMORE);
            g_core_sock.send(a_client, zmq.ZMQ_SNDMORE);
            g_core_sock.send(frame, zmq.ZMQ_SNDMORE);
            g_core_sock.send(nullfr);
            logger.debug(
                sendMessageDirect.name,
                getCurrentLineNumber(),
                "MsgType is: " +
                    msg._msg_type +
                    " Direct Writing ctx to frame, " +
                    ctx +
                    " buffer size " +
                    msg_buf.length,
                corr_id,
            );
        }
    });
}

function processProtoFile(msg) {
    //var mlist = msg.parent.order;
    var i,
        msg_list = [];
    for (i in msg.parent.nested) msg_list.push(msg.parent.nested[i]);

    //msg_list.sort();

    var pid = msg.values.ID;

    for (i = 1; i < msg_list.length; i++) {
        msg = msg_list[i];
        msg._pid = pid;
        msg._mid = i - 1;
        msg._msg_type = (pid << 8) | (i - 1);

        g_msg_by_id[msg._msg_type] = msg;
        g_msg_by_name[msg.name] = msg;
    }
}

protobuf.load("Version.proto", function (err, root) {
    if (err) throw err;

    var msg = root.lookupEnum("Version");
    if (!msg) throw "Missing Version enum in Version.Anon proto file";

    g_ver_release_year = msg.values.DATAFED_RELEASE_YEAR;
    g_ver_release_month = msg.values.DATAFED_RELEASE_MONTH;
    g_ver_release_day = msg.values.DATAFED_RELEASE_DAY;
    g_ver_release_hour = msg.values.DATAFED_RELEASE_HOUR;
    g_ver_release_minute = msg.values.DATAFED_RELEASE_MINUTE;

    g_version =
        g_ver_release_year +
        "." +
        g_ver_release_month +
        "." +
        g_ver_release_day +
        "." +
        g_ver_release_hour +
        "." +
        g_ver_release_minute;

    logger.info("protobuf.load", getCurrentLineNumber(), "Running Version: " + g_version);
    if (--g_ready_start == 0) startServer();
});

protobuf.load("SDMS_Anon.proto", function (err, root) {
    if (err) throw err;

    var msg = root.lookupEnum("SDMS.Anon.Protocol");
    if (!msg) throw "Missing Protocol enum in SDMS.Anon proto file";

    processProtoFile(msg);
    if (--g_ready_start == 0) startServer();
});

protobuf.load("SDMS_Auth.proto", function (err, root) {
    if (err) throw err;

    var msg = root.lookupEnum("SDMS.Auth.Protocol");
    if (!msg) throw "Missing Protocol enum in SDMS.Auth proto file";

    processProtoFile(msg);
    if (--g_ready_start == 0) startServer();
});

process.on("unhandledRejection", (reason, p) => {
    logger.error(
        "process.on",
        getCurrentLineNumber(),
        "Error - unhandled rejection at: Promise: " + p + " reason: " + reason,
    );
});

// This is the reply part
// on - method is a way of subscribing to events
g_core_sock.on(
    "message",
    function (delim, header, route_count, delim2, correlation_id, key, id, frame, msg_buf) {
        frame.readUInt32BE(0);
        var mtype = (frame.readUInt8(4) << 8) | frame.readUInt8(5);
        var ctx = frame.readUInt16BE(6);

        var msg_class = g_msg_by_id[mtype];
        var msg;

        if (msg_class) {
            // Only try to decode if there is a payload
            if (msg_buf && msg_buf.length) {
                try {
                    // This is unserializing the protocol message
                    msg = msg_class.decode(msg_buf);
                    if (!msg) {
                        logger.error(
                            "g_core_sock.on",
                            getCurrentLineNumber(),
                            "ERROR: msg decode failed: no reason, correlation_id: " +
                                correlation_id,
                        );
                    }
                } catch (err) {
                    logger.error(
                        "g_core_sock.on",
                        getCurrentLineNumber(),
                        "ERROR: msg decode failed: " + err + " correlation_id: " + correlation_id,
                    );
                }
            } else {
                msg = msg_class;
            }
        } else {
            logger.error(
                "g_core_sock.on",
                getCurrentLineNumber(),
                "ERROR: unknown msg type: " + mtype + " correlation_id: " + correlation_id,
            );
        }

        var f = g_ctx[ctx];
        if (f) {
            g_ctx[ctx] = null;
            logger.info(
                "g_core_sock.on",
                getCurrentLineNumber(),
                "freed ctx: " + ctx + " for msg: " + msg_class.name,
                correlation_id,
            );
            g_ctx_next = ctx;
            f(msg);
        } else {
            g_ctx[ctx] = null;
            logger.error(
                "g_core_sock.on",
                getCurrentLineNumber(),
                "ERROR: no callback found for ctxt: " +
                    ctx +
                    " - msg type: " +
                    mtype +
                    ", name: " +
                    msg_class.name +
                    " correlation_id: " +
                    correlation_id,
            );
        }
    },
);

function loadSettings() {
    g_host = "datafed.ornl.gov";
    g_port = 443;
    g_tls = true;
    g_server_key_file = "/opt/datafed/datafed-web-key.pem";
    g_server_cert_file = "/opt/datafed/datafed-web-cert.pem";
    g_core_serv_addr = "tcp://datafed.ornl.gov:7513";
    g_test = false;

    logger.info(
        loadSettings.name,
        getCurrentLineNumber(),
        "Reading configuration from file: " + process.argv[2],
    );

    try {
        var config = ini.parse(fs.readFileSync(process.argv[2], "utf-8"));

        if (config.server) {
            g_host = config.server.host || g_host;
            g_port = config.server.port || g_port;
            if (config.server.tls == "0" || config.server.tls == "false") {
                g_tls = false;
            }
            g_extern_url = config.server.extern_url;
            if (g_tls) {
                g_server_key_file = config.server.key_file || g_server_key_file;
                g_server_cert_file = config.server.cert_file || g_server_cert_file;
                g_server_chain_file = config.server.chain_file;
            }
            g_system_secret = config.server.system_secret;
            g_session_secret = config.server.session_secret;
            g_test = config.server.test || g_test;
        }
        if (config.oauth) {
            g_client_id = config.oauth.client_id || g_client_id;
            g_client_secret = config.oauth.client_secret || g_client_secret;
        }
        if (config.core) {
            g_core_serv_addr = config.core.server_address || g_core_serv_addr;
        }

        if (!g_extern_url) {
            g_extern_url = "http" + (g_tls ? "s" : "") + "://" + g_host + ":" + g_port;
        }

        if (config.operations) {
            g_google_analytics = {
                enableGoogleAnalytics: config.operations.google_analytics_tag !== "",
                googleAnalyticsTag: config.operations.google_analytics_tag,
            };
        }
    } catch (e) {
        logger.error(
            loadSettings.name,
            getCurrentLineNumber(),
            "Could not open/parse configuration file: " + process.argv[2],
        );
        logger.error(loadSettings.name, getCurrentLineNumber(), e.message);
        throw e;
    }

    if (!g_system_secret) {
        throw "Server system secret not set.";
    }
    if (!g_session_secret) {
        throw "Server session secret not set.";
    }
}

if (--g_ready_start == 0) startServer();
