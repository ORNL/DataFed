multi-part-lite [![License](https://img.shields.io/npm/l/multi-part-lite.svg)](https://github.com/strikeentco/multi-part-lite/blob/master/LICENSE) [![npm](https://img.shields.io/npm/v/multi-part-lite.svg)](https://www.npmjs.com/package/multi-part-lite)
==========
[![Build Status](https://travis-ci.org/strikeentco/multi-part-lite.svg)](https://travis-ci.org/strikeentco/multi-part-lite) [![node](https://img.shields.io/node/v/multi-part-lite.svg)](https://www.npmjs.com/package/multi-part-lite) [![Test Coverage](https://api.codeclimate.com/v1/badges/3e14955aae296674c29e/test_coverage)](https://codeclimate.com/github/strikeentco/multi-part-lite/test_coverage)

A `multi-part-lite` allows you to create multipart/form-data `Stream` and `Buffer`, which can be used to submit forms and file uploads to other web applications.

There are no external dependencies, so it as fast and simple as possible.

Supports: `Strings`, `Numbers`, `Arrays`, `Streams`, `Buffers` and `Vinyl`.

## Install
```sh
$ npm install multi-part-lite --save
```

## Usage
Usage with `got` as `Stream`:

```js
const got = require('got');
const Multipart = require('multi-part-lite');
const form = new Multipart();

form.append('photo', got.stream('https://avatars1.githubusercontent.com/u/2401029'), { filename: 'image.jpg', contentType: 'image/jpeg' });
form.append('field', 'multi-part test');

got.post('127.0.0.1:3000', { headers: form.getHeaders(), body: form.stream() });
```
Usage with `got` as `Buffer`:

```js
const got = require('got');
const Multipart = require('multi-part-lite');
const form = new Multipart();

form.append('photo', got.stream('https://avatars1.githubusercontent.com/u/2401029'), { filename: 'image.jpg', contentType: 'image/jpeg' });
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
const Multipart = require('multi-part-lite');
const form = new Multipart();

form.append('photo', https.request('https://avatars1.githubusercontent.com/u/2401029'), { filename: 'image.jpg', contentType: 'image/jpeg' });

form.stream().pipe(http.request({ headers: form.getHeaders(), hostname: '127.0.0.1', port: 3000, method: 'POST' }));
```
Usage with `http`/`https` as `Buffer`:

```js
const http = require('http');
const https = require('https');
const Multipart = require('multi-part-lite');
const form = new Multipart();

form.append('photo', https.request('https://avatars1.githubusercontent.com/u/2401029'), { filename: 'image.jpg', contentType: 'image/jpeg' });

(async () => {
  const body = await form.buffer();
  const req = http.request({ headers: form.getHeaders(false), hostname: '127.0.0.1', port: 3000, method: 'POST' });
  req.end(body);
})()
```

# API

### new Multipart([options])

Constructor.

### Params:
* **[options]** (*Object*) - `Object` with options:
  * **[boundary]** (*String|Number*) - Custom boundary for `multipart` data. Ex: if equal `CustomBoundary`, boundary will be equal exactly `CustomBoundary`.
  * **[boundaryPrefix]** (*String|Number*) - Custom boundary prefix for `multipart` data. Ex: if equal `CustomBoundary`, boundary will be equal something like `--CustomBoundary567689371204`.
  * **[defaults]** (*Object*) - `Object` with defaults values:
    * **[name]** (*String*) - File name which will be used, if `filename` is not specified in the options of `.append` method. By default `file`.
    * **[ext]** (*String*) - File extension which will be used, if `filename` is not specified in the options of `.append` method. By default `bin`.
    * **[type]** (*String*) - File content-type which will be used, if `contentType` is not specified in the options of `.append` method. By default `application/octet-stream`.

### .append(name, value, [options])

Adds a new data to the `multipart/form-data` stream.

### Params:
* **name** (*String|Number*) - Field name. Ex: `photo`.
* **value** (*Mixed*) - Value can be `String`, `Number`, `Array`, `Buffer`, `ReadableStream` or even [Vynil](https://www.npmjs.com/package/vinyl).
* **[options]** (*Object*) - Additional options:
  * **filename**  (*String*) - File name. You should always specify file name with extension, otherwise `file.bin` will be set. Ex: `anonim.jpg`.
  * **contentType** (*String*) - File content type. You should always specify content-type, otherwise `application/octet-stream` will be set. Ex: `image/jpeg`.

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

**Warning:** You must specify the correct `contentType` and `filename`. This library doesn't validate them. You can use [`multi-part`](https://github.com/strikeentco/multi-part) library which can handle it for you.

### .stream()

Returns a `multipart/form-data` stream.

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
Copyright (c) 2019 Alexey Bystrov
