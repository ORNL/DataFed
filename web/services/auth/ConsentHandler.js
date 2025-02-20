import { AUTH_URL } from "./constants.js";

/**
 * Basic implementation of `get_authorize_url` from the Globus SDK.
 *
 * This function generates the authorization URL that a user can follow to provide
 * authorization and consent via Globus Auth.
 * @param {string} client_id - The client ID of the application requesting authorization.
 * @param {string} redirect_uri - The URI to redirect to after authorization.
 * @param {boolean} [refresh_tokens=false] - Request refresh tokens in addition to access tokens.
 * @param {Array<string>} [requested_scopes=[]] - The scopes on the token(s) being requested.
 * In the case of accessing a mapped collection, this should include the mapped
 * collection's UUID, such as: `https://auth.globus.org/scopes/YOUR-UUID-HERE/data_access`.
 * @param {object} [query_params={}] - Additional parameters to be included in the authorization URL.
 * @param {string} [state="_default"] - Allows the application to pass information back to itself.
 *
 * @returns {string} The URL a user can follow to provide authorization and consent via Globus.
 */
export const generateConsentURL = (
    client_id,
    redirect_uri,
    refresh_tokens,
    requested_scopes,
    query_params,
    state,
) => {
    const scopes = requested_scopes || ["openid", "profile", "email", "urn:globus:auth:scope:transfer.api.globus.org:all"];

    if (refresh_tokens) {
        scopes.push("offline_access");
    }

    /*  NOTE: using URLSearchParams changes encoding of  " " to "+" which Globus accepts, despite saying otherwise
        https://docs.globus.org/api/auth/developer-guide/#obtaining-authorization
    */
    // TODO: consider moving back to custom encoding in anticipation that Globus will no longer accept a different encoding scheme
    const params = new URLSearchParams({
        client_id,
        redirect_uri,
        scope: scopes.join(" "), // Scopes need to be separated by a space
        state,
        response_type: "code",
        access_type: refresh_tokens === true ? "offline" : "online",
        prompt: "login",
    });

    if (query_params) {
        Object.entries(query_params).forEach(([key, value]) => {
            if (value) {
                // short-circuit on empty param values or if param already defined,
                // TODO: are there cases where we may want empty params?
                params.set(key, value);
            }
        });
    }

    return `${AUTH_URL}/v2/oauth2/authorize?${params.toString()}`;
};
