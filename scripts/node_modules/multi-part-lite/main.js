'use strict';

/* eslint-disable no-await-in-loop, max-len */

const CombinedStream = require('./lib/combine');
const {
  isString, isNumber, isStream, isHTTPStream, isBuffer,
  isArray, isVinyl, getFileName, getContentType, genBoundary
} = require('./lib/helpers');

const { next } = CombinedStream.symbols;

const CRLF = '\r\n';

const length = Symbol('length');
const started = Symbol('started');
const ended = Symbol('ended');
const stack = Symbol('stack');
const init = Symbol('init');
const generate = Symbol('generate');

const defaults = {
  name: 'file',
  ext: 'bin',
  type: 'application/octet-stream',
};

class MultipartLite extends CombinedStream {
  constructor(opts = {}) {
    super();
    this.opts = { ...opts, defaults: { ...defaults, ...opts.defaults } };
    this.boundary = this.opts.boundary || genBoundary(this.opts.boundaryPrefix);
    this.headers = {
      'content-type': `multipart/form-data; boundary="${this.getBoundary()}"`
    };
    this[length] = 0;
    this[stack] = [];

    this[started] = false;
    this[ended] = false;
  }

  [init]() {
    if (this[ended] || this[started]) {
      return;
    }
    this[started] = true;
    let value = this[stack].shift();
    while (value) {
      this[generate](...value);
      value = this[stack].shift();
    }
    this._append(`--${this.getBoundary()}--`, CRLF);
    this[ended] = true;
    this[next]();
  }

  [generate](field, value, { filename, contentType }) {
    this._append(`--${this.getBoundary()}${CRLF}`);
    this._append(`Content-Disposition: form-data; name="${field}"`);
    if (isBuffer(value) || isStream(value) || isHTTPStream(value) || isVinyl(value)) {
      if (isVinyl(value)) {
        filename = filename || value.basename;
        value = value.contents;
      }
      const file = this.getFileName(filename ? { filename } : value, this.opts.defaults);
      this._append(`; filename="${file}"${CRLF}`);
      const type = this.getContentType({ filename: filename || file, contentType }, this.opts.defaults);
      this._append(`Content-Type: ${type}${CRLF}`);
    } else {
      this._append(CRLF);
    }

    return this._append(CRLF, value, CRLF);
  }

  /**
  * List of symbols
  * @returns {Object}
  * @static
  */
  static get symbols() {
    return {
      ...CombinedStream.symbols,
      length,
      started,
      ended,
      stack,
      init,
      generate,
    };
  }

  /**
  * Returns content length. Only used with .buffer().
  * @param {Function} [cb]
  * @returns {Number}
  */
  getLength(cb) {
    // HACK: for got >= 6.5.0
    if (cb && typeof cb === 'function') {
      return cb(null, this[length]);
    }
    return this[length];
  }

  /**
  * Returns boundary.
  * @returns {String}
  */
  getBoundary() {
    return this.boundary;
  }

  /**
  * Returns headers
  * @param {Boolean} [chunked = true]
  * @returns {{'transfer-encoding': String, 'content-type': String}|{'transfer-encoding': String, 'content-length': String}}
  */
  getHeaders(chunked = true) {
    if (chunked) {
      return { ...this.headers, 'transfer-encoding': 'chunked' };
    }
    return { ...this.headers, 'content-length': String(this.getLength()) };
  }

  /**
  * Appends data to the stream
  * @param {String|Number} field
  * @param {Any} value
  * @param {Object} [options]
  * @param {String} [options.filename]
  * @param {String} [options.contentType]
  * @returns {this}
  */
  append(field, value, options = {}) {
    if (!field || (!isNumber(field) && !isString(field))) {
      throw new TypeError('Field must be specified and must be a string or a number');
    }
    if (value === undefined) {
      throw new Error('Value can\'t be undefined');
    }

    if (isArray(value)) {
      if (!value.length) {
        value = '';
      } else {
        for (let i = 0; i < value.length; i++) {
          this.append(field, value[i], options);
        }

        return this;
      }
    }

    if (value === true || value === false || value === null) {
      value = Number(value);
    }

    this[stack].push([field, value, options]);

    return this;
  }

  /**
  * Returns stream
  * @returns {this}
  */
  stream() {
    this[init]();
    return this;
  }

  /**
  * Returns buffer of the stream
  * @returns {Promise<Buffer>}
  * @async
  */
  async buffer() {
    return new Promise((resolve, reject) => {
      this.once('error', reject);
      const buffer = [];
      this.on('data', (data) => {
        buffer.push(data);
      });
      this.on('end', () => {
        const body = Buffer.concat(buffer);
        this[length] = Buffer.byteLength(body);
        return resolve(body);
      });
      return this[init]();
    });
  }
}

MultipartLite.prototype.getFileName = getFileName;
MultipartLite.prototype.getContentType = getContentType;

module.exports = MultipartLite;
