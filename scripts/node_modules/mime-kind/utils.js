'use strict';

const { promisify } = require('util');
const { access } = require('fs');
const { normalize } = require('path');

const BUFFER_LENGTH = 262;

const accessAsync = promisify(access);

/**
 * Returns true if value is a String
 * @param {*} val
 * @returns {Boolean}
 */
function isString(val) {
  return typeof val === 'string';
}

/**
 * Returns true if value is an Object
 * @param {*} val
 * @returns {Boolean}
 */
function isObject(val) {
  return Object.prototype.toString.call(val) === '[object Object]';
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
 * Tests whether or not the given path exists
 * @param {String} path
 * @returns {Promise<Boolean>}
 * @async
 */
async function isExists(path) {
  try {
    await accessAsync(normalize(path));
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Read a chunk from a stream
 * @param {ReadableStream} stream
 * @returns {Promise<Buffer>}
 * @async
 */
async function streamChunk(stream) {
  return new Promise((resolve, reject) => {
    stream.once('error', reject);
    stream.once('readable', () => {
      const chunk = stream.read(BUFFER_LENGTH) || stream.read();
      if (chunk) {
        stream.unshift(chunk);
      }
      return resolve(chunk);
    });
  });
}

module.exports = {
  isString,
  isObject,
  isBuffer,
  isStream,
  isExists,
  streamChunk,

  BUFFER_LENGTH
};
