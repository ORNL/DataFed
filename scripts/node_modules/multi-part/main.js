'use strict';

/* eslint-disable class-methods-use-this, no-await-in-loop, max-len, no-promise-executor-return */

const { basename } = require('path');
const MultipartLite = require('multi-part-lite');
const {
  isBuffer, isStream, isHTTPStream, isVinyl
} = require('multi-part-lite/lib/helpers');
const mime = require('mime-kind');

const {
  init, started, ended, stack, generate, next, length
} = MultipartLite.symbols;

const CRLF = '\r\n';

class Multipart extends MultipartLite {
  /**
   * Returns file name of val
   * @param {Object} val
   * @param {String} [val.filename]
   * @param {String} [val.path]
   * @param {Object} defaults
   * @param {String} defaults.name
   * @param {String} defaults.ext
   * @returns {Promise<String>}
   * @async
   */
  async getFileName(val, { name, ext, type }) {
    if (isBuffer(val)) {
      const m = await mime.async(val, type);
      return `${name}.${m.ext}`;
    }

    const filename = val.filename || val.path;

    if (filename) {
      return basename(filename);
    }

    return `${name}.${ext}`;
  }

  /**
   * Returns content-type of val
   * @param {Object} val
   * @param {String} [val.contentType]
   * @param {Object} defaults
   * @param {String} defaults.type
   * @returns {Promise<String>}
   * @async
   */
  async getContentType(val, { type }) {
    if (val.contentType) {
      return val.contentType;
    }
    const m = await mime.async(val.filename, type);
    return m.mime;
  }

  async [init]() {
    if (this[ended] || this[started]) {
      return;
    }
    this[started] = true;
    let value = this[stack].shift();
    while (value) {
      await this[generate](...value);
      value = this[stack].shift();
    }
    this._append(`--${this.getBoundary()}--`, CRLF);
    this[ended] = true;
    this[next]();
  }

  async [generate](field, value, { filename, contentType }) {
    this._append(`--${this.getBoundary()}${CRLF}`);
    this._append(`Content-Disposition: form-data; name="${field}"`);
    if (isBuffer(value) || isStream(value) || isHTTPStream(value) || isVinyl(value)) {
      if (isVinyl(value)) {
        filename = filename || value.basename;
        value = value.contents;
      }
      const file = await this.getFileName(filename ? { filename } : value, this.opts.defaults);
      this._append(`; filename="${file}"${CRLF}`);
      const type = await this.getContentType({ filename: filename || file, contentType }, this.opts.defaults);
      this._append(`Content-Type: ${type}${CRLF}`);
    } else {
      this._append(CRLF);
    }

    return this._append(CRLF, value, CRLF);
  }

  /**
   * Returns stream
   * @returns {Promise<this>}
   * @async
   */
  async stream() {
    await this[init]();
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
      return this[init]().catch(reject);
    });
  }
}

module.exports = Multipart;
module.exports.MultipartAsync = Multipart;
