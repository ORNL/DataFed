multi-part [![License](https://img.shields.io/npm/l/multi-part.svg)](https://github.com/strikeentco/multi-part/blob/master/LICENSE) [![npm](https://img.shields.io/npm/v/multi-part.svg)](https://www.npmjs.com/package/multi-part)
==========
[![Build Status](https://travis-ci.org/strikeentco/multi-part.svg)](https://travis-ci.org/strikeentco/multi-part) [![node](https://img.shields.io/node/v/multi-part.svg)](https://www.npmjs.com/package/multi-part) [![Test Coverage](https://api.codeclimate.com/v1/badges/9876ebf194e36617bcea/test_coverage)](https://codeclimate.com/github/strikeentco/multi-part/test_coverage)

A `multi-part` allows you to create multipart/form-data `Stream` and `Buffer`, which can be used to submit forms and file uploads to other web applications.

It extends [`multi-part-lite`](https://github.com/strikeentco/multi-part-lite) and adds automatic data type detection.

Supports: `Strings`, `Numbers`, `Arrays`, `ReadableStreams`, `Buffers` and `Vinyl`.

## Install
```sh
$ npm install multi-part --save
```

## Usage
Usage with `got` as `Stream`:

```js
const got = require('got');
const Multipart = require('multi-part');
const form = new Multipart();

form.append('photo', got.stream('https://avatars1.githubusercontent.com/u/2401029'));
form.append('field', 'multi-part test');

(async () => {
  const body = await form.stream();
  got.post('127.0.0.1:3000', { headers: form.getHeaders(), body });
})()
```
Usage with `got` as `Buffer`:

```js
const got = require('got');
const Multipart = require('multi-part');
const form = new Multipart();

form.append('photo', got.stream('https://avatars1.githubusercontent.com/u/2401029'));
form.append('field', 'multi-part test');

(async () => {
  const body = await form.buffer();
  got.post('127.0.0.1:3000', { headers: form.getHeaders(false), body });
})()
```
Usage with `http`/`https` as `Stream`:

```js
const http = require('http');
const https = require('https');
const Multipart = require('multi-part');
const form = new Multipart();

form.append('photo', https.request('https://avatars1.githubusercontent.com/u/2401029'));

(async () => {
  const stream = await form.stream();
  stream.pipe(http.request({ headers: form.getHeaders(), hostname: '127.0.0.1', port: 3000, method: 'POST' }));
})()
```
Usage with `http`/`https` as `Buffer`:

```js
const http = require('http');
const https = require('https');
const Multipart = require('multi-part');
const form = new Multipart();

form.append('photo', https.request('https://avatars1.githubusercontent.com/u/2401029'));

(async () => {
  const body = await form.buffer();
  const req = http.request({ headers: form.getHeaders(false), hostname: '127.0.0.1', port: 3000, method: 'POST' });
  req.end(body);
})()
```

# API

### new Multipart([options])
### new MultipartAsync([options])

Constructor.

### Params:
* **[options]** (*Object*) - `Object` with options:
  * **[boundary]** (*String|Number*) - Custom boundary for `multipart` data. Ex: if equal `CustomBoundary`, boundary will be equal exactly `CustomBoundary`.
  * **[boundaryPrefix]** (*String|Number*) - Custom boundary prefix for `multipart` data. Ex: if equal `CustomBoundary`, boundary will be equal something like `--CustomBoundary567689371204`.
  * **[defaults]** (*Object*) - `Object` with defaults values:
    * **[name]** (*String*) - File name which will be used, if `filename` is not specified in the options of `.append` method. By default `file`.
    * **[ext]** (*String*) - File extension which will be used, if `filename` is not specified in the options of `.append` method. By default `bin`.
    * **[type]** (*String*) - File content-type which will be used, if `contentType` is not specified in the options of `.append` method. By default `application/octet-stream`.

```js
const Multipart = require('multi-part');
const { MultipartAsync } = require('multi-part');
```

### .append(name, value, [options])

Adds a new data to the `multipart/form-data` stream.

### Params:
* **name** (*String|Number*) - Field name. Ex: `photo`.
* **value** (*Mixed*) - Value can be `String`, `Number`, `Array`, `Buffer`, `ReadableStream` or even [Vynil](https://www.npmjs.com/package/vinyl).
* **[options]** (*Object*) - Additional options:
  * **filename**  (*String*) - File name. Ex: `anonim.jpg`.
  * **contentType** (*String*) - File content type. It's not necessary if you have already specified file name. If you are not sure about the content type - leave `filename` and `contentType` empty and it will be automatically determined, if possible. Ex: `image/jpeg`.

If `value` is an array, `append` will be called for each value:
```js
form.append('array', [0, [2, 3], 1]);

// similar to

form.append('array', 0);
form.append('array', 2);
form.append('array', 3);
form.append('array', 1);
```

`Null`, `false` and `true` will be converted to `'0'`, `'0'` and `'1'`. Numbers will be converted to strings also.

For `Buffer` and `ReadableStream` content type will be automatically determined, if it's possible, and name will be specified according to content type. If content type is `image/jpeg`, file name will be set as `file.jpeg` (if `filename` option is not specified).<br>In case content type is undetermined, content type and file name will be set as `application/octet-stream` and `file.bin`.

### .stream()

Returns a `Promise` with a `multipart/form-data` stream.

### .buffer()

Returns a `Promise` with a buffer of the `multipart/form-data` stream data.

### .getBoundary()

Returns the form boundary used in the `multipart/form-data` stream.

```js
form.getBoundary(); // -> '--MultipartBoundary352840693617'
```

### .getLength()

Returns the length of a buffer of the `multipart/form-data` stream data.

Should be called after `.buffer()`;

For `.stream()` it's always `0`.

```js
await form.buffer();
form.getLength(); // -> 12345
```

### .getHeaders(chunked = true)

Returns the headers.

If you want to get correct `content-length`, you should call it after `.buffer()`. There is no way to know `content-length` of the `.stream()`, so it will be always `0`.

### Params:
* **chunked** (*Boolean*) - If `false` - headers will include `content-length` header, otherwise there will be `transfer-encoding: 'chunked'`.

```js
form.getHeaders(); // ->
//{
//  'transfer-encoding': 'chunked',
//  'content-type': 'multipart/form-data; boundary="--MultipartBoundary352840693617"'
//}
```
With `.buffer()`:
```js
form.getHeaders(false); // ->
//{
//  'content-length': '0',
//  'content-type': 'multipart/form-data; boundary="--MultipartBoundary352840693617"'
//}

await form.buffer();
form.getHeaders(false); // ->
//{
//  'content-length': '12345',
//  'content-type': 'multipart/form-data; boundary="--MultipartBoundary352840693617"'
//}
```

## License

The MIT License (MIT)<br/>
Copyright (c) 2015-2022 Alexey Bystrov
