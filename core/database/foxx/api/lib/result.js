/**
 * Result type for Rust-like error handling
 * Rust's Result<T, E> type is used for recoverable errors
 * This pattern makes error handling explicit and composable
 * @type {{ok: (function(*): {ok: boolean, value: *}), err: (function(*): {ok: boolean, error: *})}}
 */
const Result = {
  ok: (value) => ({ ok: true, value, raiseIfError() { return this.value; } }),
  err: (error) => ({ ok: false, error, raiseIfError() { throw [this.error.code, this.error.message] } }),
};

module.exports = {
    Result,
};
