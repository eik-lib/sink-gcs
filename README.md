# @eik/sink-gcs

A sink for writing to and reading from [Google Cloud Storage][gcs].

[![Dependencies](https://img.shields.io/david/eik-lib/sink-gcs.svg)](https://david-dm.org/eik-lib/sink-gcs)
[![GitHub Actions status](https://github.com/eik-lib/sink-gcs/workflows/Run%20Lint%20and%20Tests/badge.svg)](https://github.com/eik-lib/sink-gcs/actions?query=workflow%3A%22Run+Lint+and+Tests%22)
[![Known Vulnerabilities](https://snyk.io/test/github/eik-lib/sink-gcs/badge.svg?targetFile=package.json)](https://snyk.io/test/github/eik-lib/sink-gcs?targetFile=package.json)

The intention of the [Eik][eik] sink modules is to be able to write to and read from
files in different storage backends by swapping sink modules. Because each sink
implements the same public API it is possible to use this sink in one environment and
another sink in a different environment.

## Installation

```bash
$ npm install @eik/sink-gcs
```

## Example

Read a file from [Google Cloud Storage][gcs] and serve it on HTTP:

```js
const { pipeline } = require('stream');
const express = require("express");
const Sink = require("@eik/sink-gcs");

const app = express();
const sink = new Sink({
    credentials: {
        client_email: 'a@email.address',
        private_key: '[ ...snip... ]',
        projectId: 'myProject',
    },
}, {
    writeTimeout: 20000,
});

app.get("/file.js", async (req, res, next) => {
    try {
        const file = await sink.read('/path/to/file/file.js');
        pipeline(file.stream, res, (error) => {
            if (error) return next(error);
        });
    } catch (error) {
        next(error);
    }
});

app.listen(8000);
```

## Constructor

Create a new Sink instance.

```js
const Sink = require("@eik/sink-gcs");

const sink = new Sink({
    credentials: {
        client_email: 'a@email.address',
        private_key: '[ ...snip... ]',
    },
    projectId: 'myProject',
}, {
    ...options...
});
```

This constructor takes the following arguments:

 * `storageOptions` - Object - A Google Cloud Storage [storage options object][gcs-storage-options] - Required.
 * `options` - Object - Other options related to storage and behavior - Optional.
    * `writeTimeout` - Number - Timeout, in milliseconds, for write operations to the sink - Default: `60000` - Optional.
    * `writeGzip` - Boolean - If files should be written with gzip compression - Default: `false` - Optional.
    * `rootPath` - String - Root directory for where to store files in the GCS bucket - Default: `eik` - Optional.
    * `bucket` - String - Name of the bucket to store files in - Default: `eik_files` - Optional.

## API

The sink instance has the following API:

### .write(filePath, contentType)

Async method for writing a file to storage.

This method takes the following arguments:

* `filePath` - String - Path to the file to be stored - Required.
* `contentType` - String - The content type of the file - Required.

Resolves with a writable stream.

```js
const { pipeline } = require('stream);

const fromStream = new SomeReadableStream();
const sink = new Sink({ ... });

try {
    const file = await sink.write('/path/to/file/file.js', 'application/javascript');
    pipeline(fromStream, file.stream, (error) => {
        if (error) console.log(error);
    });
} catch (error) {
    console.log(error);
}
```

### .read(filePath)

Async method for reading a file from storage.

This method takes the following arguments:

* `filePath` - String - Path to the file to be read - Required.

Resolves with a [ReadFile][read-file] object which holds metadata about
the file and a readable stream with the byte stream of the file on the
`.stream` property.

```js
const { pipeline } = require('stream);

const toStream = new SomeWritableStream();
const sink = new Sink({ ... });

try {
    const file = await sink.read('/path/to/file/file.js');
    pipeline(file.stream, toStream, (error) => {
        if (error) console.log(error);
    });
} catch (error) {
    console.log(error);
}
```

### .delete(filePath)

Async method for deleting a file in storage.

This method takes the following arguments:

* `filePath` - String - Path to the file to be deleted - Required.

Resolves if file is deleted and rejects if file could not be deleted.

```js
const sink = new Sink({ ... });

try {
    await sink.delete('/path/to/file/file.js');
} catch (error) {
    console.log(error);
}
```

### .exist(filePath)

Async method for checking if a file exist in the storage.

This method takes the following arguments:

* `filePath` - String - Path to the file to be checked for existence - Required.

Resolves if file exists and rejects if file does not exist.

```js
const sink = new Sink({ ... });

try {
    await sink.exist('/path/to/file/file.js');
} catch (error) {
    console.log(error);
}
```

## Properties

The Sink instance has the following properties:

### .metrics

Attribute which holds a [metrics stream](https://github.com/metrics-js/client) that
emits metrics data.

The stream will emit an event of the following character for each metric:

```js
{
    name: 'eik_core_sink_gcs',
    description: 'Counter measuring access to the Google Cloud Storage sink',
    timestamp: 1579468682.531,
    type: 2,
    value: 1,
    labels: [
        {
            name: 'operation',
            value: 'write'
        },
        {
            name: 'success',
            value: true
        },
        {
            name: 'access',
            value: true
        }
    ],
    time: null,
    meta: {}
}
```

The metric will have the following labels:

 * `operation` - `String` - The operation which triggered the metric. Can be `write`, `read`, `delete` or `exist`.
 * `success` - `Boolean` - If the operation was successfull in terms of being a valid operation and running the operation against the Google Cloud Storage without erroring. 
 * `access` - `Boolean` - If the operation triggered access to the Google Cloud Storage.

Do note that the `access` label is `true` when the Sink runs an operation against the 
Google Cloud Storage which can generate a cost. In other words; this can be used to
monitor excessive access to prevent cost. 

## License

Copyright (c) 2020 FINN.no

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

[eik]: https://github.com/eik-lib
[gcs-auth]: https://googlecloudplatform.github.io/google-cloud-node/#/docs/google-cloud/0.50.0/google-cloud
[gcs-storage-options]: https://googleapis.dev/nodejs/storage/latest/global.html#StorageOptions
[gcs]: https://cloud.google.com/storage/
[read-file]: https://github.com/eik-lib/common/blob/master/lib/classes/read-file.js
