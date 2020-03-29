# @eik/sink-gcs

A sink for writing to and reading from [Google Cloud Storage][gcs].

[![Dependencies](https://img.shields.io/david/eik-lib/sink-gcs.svg)](https://david-dm.org/eik-lib/sink-gcs)
[![GitHub Actions status](https://github.com/eik-lib/sink-gcs/workflows/Run%20Lint%20and%20Tests/badge.svg)](https://github.com/eik-lib/sink-gcs/actions?query=workflow%3A%22Run+Lint+and+Tests%22)
[![Known Vulnerabilities](https://snyk.io/test/github/eik-lib/sink-gcs/badge.svg?targetFile=package.json)](https://snyk.io/test/github/eik-lib/sink-gcs?targetFile=package.json)

The intention of the [Eik][eik] sink modules is to be able to write and read files
to  different backends by swapping sink modules. Because each sink implements the
same public API it is possible to use this sink in one environment and another sink
in another environment.

## Installation

```bash
$ npm install @eik/sink-gcs
```

## Example

Read an file from [Google Cloud Storage][gcs] and serve it on http:

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
        projectId: 'myProject',
    },
});
```

### options

An options object containing configuration. The following values can be provided:

* `.credentials` - Object - A Google Cloud Storage [auth object][gcs-auth] - Required.

## API

The Sink instance has the following API:

### .write(filePath, contentType)

Async method for writing a file to storage.

The method takes the following arguments:

* `filePath` - String - Path to the file to be stored - Required.
* `contentType` - String - The content type of the file - Required.

Resolves with a writable stream.

```js
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

The method takes the following arguments:

* `filePath` - String - Path to the file to be read - Required.

```js
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

Async method for deleting a file on the storage.

The method takes the following arguments:

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

The method takes the following arguments:

* `filePath` - String - Path to the file to be checked for existence - Required.

Resolves if file exist and rejects if file does not exist.

```js
const sink = new Sink({ ... });
try {
    await sink.exist('/path/to/file/file.js');
} catch (error) {
    console.log(error);
}
```

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
[gcs]: https://cloud.google.com/storage/
