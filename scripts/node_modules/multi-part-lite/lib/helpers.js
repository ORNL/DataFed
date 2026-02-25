'use strict';

const { Readable } = require('stream');
const { ClientRequest } = require('http');
const { basename } = require('path');

const DEFAULT_PREFIX = 'MultipartBoundary';

/**
 * Returns true if value is a String
 * @param {*} val
 * @returns {Boolean}
 */
function isString(val) {
  return typeof val === 'string';
}

/**
 * Returns true if value is a Number
 * @param {*} val
 * @returns {Boolean}
 */
function isNumber(val) {
  return typeof val === 'number';
}

/**
 * Returns true if value is a Buffer, UInt8Array or ArrayBuffer
 * @param {*} val
 * @returns {Boolean}
 */
function isBuffer(val) {
  return Buffer.isBuffer(val) || val instanceof Uint8Array || val instanceof ArrayBuffer;
}

/**
 * Returns true if value is a Readable Stream
 * @param {*} val
 * @returns {Boolean}
 */
function isStream(val) {
  return typeof val === 'object' && typeof val.pipe === 'function'
    && val.readable !== false && typeof val._read === 'function' && !val.closed && !val.destroyed;
}

/**
 * Returns true if value is a Client Request
 * @param {*} val
 * @returns {Boolean}
 */
function isHTTPStream(val) {
  return val && val instanceof ClientRequest;
}

/**
 * Returns true if value is a Promise
 * @param {*} val
 * @returns {Boolean}
 */
function isPromise(val) {
  return (typeof val === 'object' || typeof val === 'function') && typeof val.then === 'function';
}

/**
 * Returns true if value is a Vinyl
 * @param {*} val
 * @returns {Boolean}
 */
function isVinyl(val) {
  return val && val._isVinyl === true;
}

/**
 * Converts val to streamable variant
 * @param {*} val
 * @returns {*}
 */
function toStreamable(val) {
  if (isNumber(val)) {
    return String(val);
  }

  if (!val || isString(val) || isBuffer(val) || isStream(val) || isPromise(val)) {
    return val;
  }

  if (isHTTPStream(val)) {
    return new Promise((resolve, reject) => {
      val.on('response', resolve).end();
      val.on('error', reject);
    });
  }

  const wrap = new Readable().wrap(val);
  if (val.destroy) {
    wrap.destroy = val.destroy.bind(val);
  }

  return wrap;
}

/**
 * Returns file name of val
 * @param {Object} val
 * @param {String} [val.filename]
 * @param {String} [val.path]
 * @param {Object} defaults
 * @param {String} defaults.name
 * @param {String} defaults.ext
 * @returns {String}
 */
function getFileName(val, { name, ext }) {
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
 * @returns {String}
 */
function getContentType(val, { type }) {
  return val.contentType || type;
}

/**
 * Generates boundary by a prefix
 * @param {String|Number} prefix
 * @returns {String}
 */
function genBoundary(prefix = DEFAULT_PREFIX) {
  let boundary = `--${prefix}`;

  for (let i = 0; i < 12; i++) {
    boundary += Math.floor(Math.random() * 10).toString(16);
  }

  return boundary;
}


module.exports = {
  isArray: Array.isArray,
  isString,
  isNumber,
  isBuffer,
  isStream,
  isHTTPStream,
  isPromise,
  isVinyl,

  toStreamable,
  getFileName,
  getContentType,
  genBoundary
};
