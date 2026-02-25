'use strict';

const { Readable } = require('stream');
const {
  toStreamable, isPromise, isBuffer, isString
} = require('./helpers');

const current = Symbol('current');
const queue = Symbol('queue');
const forwarding = Symbol('forwarding');
const next = Symbol('next');
const forward = Symbol('forward');
const nextStream = Symbol('nextStream');

class CombinedStream extends Readable {
  constructor() {
    super();
    this.destroyed = false;
    this._drained = false;
    this[forwarding] = false;
    this[current] = null;
    this[queue] = [];
  }

  /**
  * List of symbols
  * @returns {Object}
  * @static
  */
  static get symbols() {
    return {
      current, queue, forwarding, next, forward, nextStream,
    };
  }

  /**
  * Appends data to queue
  * @param {...Any} data
  * @returns {Void}
  */
  _append(...data) {
    this[queue].push(...data.map(value => toStreamable(value)));
  }

  /**
  * Readable stream _read implementation
  * @returns {Void}
  */
  _read() {
    this._drained = true;
    this[forward]();
  }

  [forward]() {
    if (this[forwarding] || !this._drained || !this[current]) {
      return;
    }

    this[forwarding] = true;

    let chunk = this[current].read();
    while (chunk !== null) {
      this._drained = this.push(chunk);
      chunk = this[current].read();
    }

    this[forwarding] = false;
  }

  [next]() {
    this[current] = null;

    const stream = this[queue].shift();
    if (isPromise(stream)) {
      return stream.then(res => this[nextStream](toStreamable(res))).catch(e => this.destroy(e));
    }
    if (isString(stream) || isBuffer(stream)) {
      this._drained = this.push(stream);
      return this[next]();
    }

    this[nextStream](stream);
  }

  [nextStream](stream) {
    if (!stream) {
      this.push(null);
      return this.destroy();
    }

    this[current] = stream;
    this[forward]();

    const onReadable = () => this[forward]();

    const onError = e => this.destroy(e);

    const onClose = () => {
      if (!stream._readableState.ended) {
        onEnd(); // eslint-disable-line
        this.destroy();
      }
    };

    const onEnd = () => {
      this[current] = null;
      stream.removeListener('readable', onReadable);
      stream.removeListener('end', onEnd);
      stream.removeListener('error', onError);
      stream.removeListener('close', onClose);
      this[next]();
    };

    stream.on('readable', onReadable);
    stream.on('error', onError);
    stream.on('close', onClose);
    stream.on('end', onEnd);
  }

  /**
  * Destroys stream
  * @param {Error} [e]
  * @returns {Void}
  */
  destroy(e) {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;

    if (this[current] && this[current].destroy) {
      this[current].destroy();
    }

    this[queue].map(stream => stream.destroy && stream.destroy());

    if (e) {
      this.emit('error', e);
    }

    this.emit('close');
  }
}

module.exports = CombinedStream;
