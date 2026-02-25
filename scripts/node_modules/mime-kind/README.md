mime-kind [![License](https://img.shields.io/npm/l/mime-kind.svg)](https://github.com/strikeentco/mime-kind/blob/master/LICENSE) [![npm](https://img.shields.io/npm/v/mime-kind.svg)](https://www.npmjs.com/package/mime-kind)
==========
[![Build Status](https://travis-ci.org/strikeentco/mime-kind.svg)](https://travis-ci.org/strikeentco/mime-kind) [![node](https://img.shields.io/node/v/mime-kind.svg)](https://www.npmjs.com/package/mime-kind) [![Test Coverage](https://api.codeclimate.com/v1/badges/5c3c2bdb323d9132a2f4/test_coverage)](https://codeclimate.com/github/strikeentco/mime-kind/test_coverage)

Detect the MIME type of a `Buffer`, `Uint8Array`, `ArrayBuffer`, `ReadableStream`, file path and file name, with `async` method.

## Install
```sh
$ npm install mime-kind --save
```

## Usage

```js
const { createReadStream } = require('fs');
const mime = require('mime-kind');

await mime('.fakeext'); // -> null
await mime(createReadStream('./anonim.jpg')); // -> { ext: 'jpeg', mime: 'image/jpeg' }
await mime('c:/anonim.jpeg'); // -> { ext: 'jpeg', mime: 'image/jpeg' }
```

## API

### mime(input, [defaultValue])
### mime.async(input, [defaultValue])

Returns a `Promise` with an object (or `null` when no match) with:

* `ext` - file type
* `mime` - the [MIME type](http://en.wikipedia.org/wiki/Internet_media_type)

This methods supports all kind of `ReadableStreams`.

### Params:

* **input** (*String|Buffer|Uint8Array|ArrayBuffer|ReadableStream*) - `Buffer`, `Uint8Array`, `ArrayBuffer`, `ReadableStream`, file path or file name.
* **[defaultValue]** (*String|Object*) - `String` or `Object` with value which will be returned if no match will be found. If `defaultValue` is incorrect returns `null`.

```js
const mime = require('mime-kind');

await mime('.fakeext', 'application/octet-stream'); // -> { ext: 'bin', mime: 'application/octet-stream' }
await mime.async('.fakeext', { ext: 'mp4', mime: 'video/mp4' }); // -> { ext: 'mp4', mime: 'video/mp4' }
await mime.async('.fakeext', 'ogg'); // -> { ext: 'ogg', mime: 'audio/ogg' }
// but
await mime.async('.fakeext', 'ogg3'); // -> null
await mime('.fakeext', { ext: 'fake', mime: 'fake/fake' }); // -> null
```

With `HTTP(S)` streams:
```js
const mime = require('mime-kind');
const { get } = require('https');
const { PassThrough } = require('stream');

const pass = new PassThrough();
get('https://avatars0.githubusercontent.com/u/2401029', res => res.pipe(pass));
await mime(pass); // -> { ext: 'jpg', mime: 'image/jpeg' }
```

## License

The MIT License (MIT)<br/>
Copyright (c) 2015-2022 Alexey Bystrov
