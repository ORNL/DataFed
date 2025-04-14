"use strict";

/**
 * @property {string} [access] - Access token
 * @property {string} [refresh] - Refresh token
 * @property {number} [expiration] - Exact DataFed server time of expiration
 * @property {g_lib.AccessTokenType | number} [type] - Access token type, present when retrieving a collection token
 * @property {string} [dependent_scopes] - Access token scopes, present when retrieving a collection token
 * @property {string} [access_iv] - Access token iv for decrypting the encrypted token
 * @property {string} [access_len] - Access token len for decrypting the encrypted token
 * @property {string} [refresh_iv] - Access token iv for decrypting the encrypted token
 * @property {string} [refresh_len] - Refresh token len for decrypting the encrypted token
 */
class DataFedOAuthToken {
    static access;
    static refresh;
    static expiration;
    static type;
    static dependent_scopes;
    static access_iv;
    static access_len;
    static refresh_iv;
    static refresh_len;
}

module.exports = { DataFedOAuthToken };
