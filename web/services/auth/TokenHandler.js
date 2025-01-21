// TODO: convert to protobufjs read of enum

export const AccessTokenType = Object.freeze({
    GENERIC: 1,
    GLOBUS: 2,
    GLOBUS_AUTH: 3,
    GLOBUS_TRANSFER: 4,
    GLOBUS_DEFAULT: 5,
    ACCESS_SENTINEL: 255,
});

/** Handler for custom token logic
 *
 */
export default class OAuthTokenHandler {
    #client_token;
    #other_tokens_exist = false;
    #token_type;

    /**
     * @typedef {object} OAuthTransferToken
     * @property {string} access_token - Access token
     * @property {string} [refresh_token] - Refresh token
     * @property {number} expires_in - Integer time in ms until expiration
     * @property {string} scope - Scope of token
     */
    #oauth_transfer_token_schema = {
        access_token: (input_string) => {
            if (typeof input_string !== "string") {
                throw new Error("Missing required parameter 'access_token': string");
            }
        },
        refresh_token: (input_string) => {
            if (typeof input_string !== "string") {
                throw new Error("Missing required parameter 'refresh_token': string");
            }
        },
        expires_in: (input_number) => {
            if (typeof input_number !== "number") {
                throw new Error("Missing required parameter 'expires_in': number");
            }
        },
        scope: (input_string) => {
            if (typeof input_string !== "string") {
                throw new Error("Missing required parameter 'scope': string");
            }
        },
    };
    /**
     * @param {object} client_token - OAuth token object from which to extract relevant information
     * @param {OAuthTransferToken} client_token.data - Raw data object for OAuth token
     * @param {array} client_token.data.other_tokens - Other OAuth tokens passed with parent, can be empty
     * @param {string} client_token.data.resource_server - Resource server on which OAuth token functions
     */
    constructor(client_token) {
        this.#client_token = Object.freeze(client_token);
        this.#other_tokens_exist = client_token.data.other_tokens.length > 0;
        this.#token_type = this.#resolveTokenType();
        this.#validateToken();
    }

    /**
     * Validates client token is supported and has required properties
     */
    #validateToken() {
        // TODO: build capability for currently unsupported token types
        switch (this.#token_type) {
            case AccessTokenType.GENERIC: {
                throw new Error("Unsupported token");
            }
            case AccessTokenType.GLOBUS: {
                throw new Error("Unsupported token");
            }
            case AccessTokenType.GLOBUS_AUTH: {
                throw new Error("Unsupported token");
            }
            case AccessTokenType.GLOBUS_TRANSFER: {
                const transfer_token = this.#client_token.data;
                Object.keys(this.#oauth_transfer_token_schema).map((key) => {
                    // Inspired by: https://stackoverflow.com/a/38616988
                    this.#oauth_transfer_token_schema[key](transfer_token[key]);
                });
                break;
            }
            case AccessTokenType.GLOBUS_DEFAULT: {
                if (!this.#other_tokens_exist) {
                    throw new Error(
                        "Default token handling requires additional transfer tokens in other_tokens field",
                    );
                }
                const first_token = this.#client_token.data.other_tokens[0];
                Object.keys(this.#oauth_transfer_token_schema).map((key) => {
                    // Inspired by: https://stackoverflow.com/a/38616988
                    this.#oauth_transfer_token_schema[key](first_token[key]);
                });
                break;
            }
            case AccessTokenType.ACCESS_SENTINEL: {
                throw new Error("Invalid state");
            }
        }
    }

    /** Resolves token type based on a provided resource server
     *
     * @returns {AccessTokenType | number}
     */
    #resolveTokenType() {
        const resource_server = this.#client_token.data.resource_server;
        let token_type;
        switch (
            resource_server // TODO: exhaustive coverage of types
        ) {
            case "auth.globus.org": {
                token_type = this.#other_tokens_exist
                    ? AccessTokenType.GLOBUS_DEFAULT
                    : AccessTokenType.GLOBUS_AUTH;
                break;
            }
            case "transfer.api.globus.org": {
                token_type = AccessTokenType.GLOBUS_TRANSFER;
                break;
            }
            default: {
                token_type = AccessTokenType.GENERIC;
            }
        }
        return token_type;
    }

    /** Allows read access to resolved token type
     *
     * @returns {AccessTokenType | number}
     */
    getTokenType() {
        let return_value = this.#token_type;
        if (typeof return_value === "object") {
            // should not be the case
            return_value = Object.freeze(this.#token_type);
        }
        return return_value;
    }

    /** OptionalData object
     * @typedef {object} OptionalData
     * @property {AccessTokenType | number} type - The type of token being stored
     * @property {string} [other] - Additional constructed data to provide more context for backend
     */
    /** Constructs optional token data for SetAccessToken based on token type
     *
     * @param {object} token_context - Object with arbitrary keys for context when building optional data
     * @param {string} [token_context.collection_id] - Globus Collection ID to be associated with token
     * @param {string} [token_context.scope] - Scope(s) to be associated with token
     * @returns {OptionalData}
     * @throws Error - When a required collection ID cannot be found in the session
     */
    constructOptionalData(token_context) {
        const token_type = this.#token_type;
        let optional_data = { type: token_type };
        switch (token_type) {
            case AccessTokenType.GLOBUS_AUTH: {
                throw new Error("Invalid state"); // TODO: build capability
            }
            case AccessTokenType.GLOBUS_TRANSFER: {
                const { collection_id, scope } = token_context;
                if (!collection_id) {
                    throw new Error("Transfer token received without collection context");
                }
                if (!scope) {
                    throw new Error("Transfer token received without scope context");
                }
                optional_data.other = collection_id + "|" + scope; // Database API expects format `<uuid>|<scope>`
                break;
            }
            case AccessTokenType.GLOBUS_DEFAULT: {
                break;
            }
            default: {
                // TODO: exhaustive coverage of types
                throw new Error("Invalid state");
            }
        }

        return optional_data;
    }

    /**
     * @returns {OAuthTransferToken} - Appropriate OAuth transfer token depending upon token configuration
     */
    extractTransferToken() {
        return this.#token_type === AccessTokenType.GLOBUS_DEFAULT && this.#other_tokens_exist
            ? this.#client_token.data.other_tokens[0]
            : this.#client_token.data; // Auth tokens in DEFAULT come with an additional transfer token, but transfer tokens (which come with consent collections) will come alone (for now)
    }
}
