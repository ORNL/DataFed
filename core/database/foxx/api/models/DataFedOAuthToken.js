"use strict";

/**
 * @property {string} [access] - Access token
 * @property {string} [refresh] - Refresh token
 * @property {number} [expiration] - Exact DataFed server time of expiration
 * @property {g_lib.AccessTokenType | number} [type] - Access token type, present when retrieving a collection token
 * @property {string} [dependent_scopes] - Access token scopes, present when retrieving a collection token
 */
class DataFedOAuthToken {
    access;
    refresh;
    expiration;
    type;
    dependent_scopes;
}

module.exports = {DataFedOAuthToken}