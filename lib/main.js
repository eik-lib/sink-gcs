'use strict';

const { Storage } = require('@google-cloud/storage');
const { ReadFile, Sink } = require('@eik/common');
const path = require('path');

const DEFAULT_ROOT_PATH = 'eik';
const DEFAULT_BUCKET = 'eik_files';

/**
 * A sink for uploading files to Google Cloud Storage
 * https://googleapis.dev/nodejs/storage/latest/
 *
 * @class SinkGCS
 */

const SinkGCS = class SinkGCS extends Sink {
    constructor(storageOptions, {
        rootPath = DEFAULT_ROOT_PATH,
        bucket = DEFAULT_BUCKET,
    } = {}) {
        super();
        if (typeof storageOptions !== 'object' || storageOptions === null) throw new Error('"storageOptions" argument must be provided');;
        this._rootPath = rootPath;
        this._storage = new Storage(storageOptions);
        this._bucket = this._storage.bucket(bucket);
    }

    write(filePath, contentType) {
        const file = super.constructor.validateFilePath(filePath);
        const mime = super.constructor.validateContentType(contentType);

        return new Promise((resolve, reject) => {
            const pathname = path.join(this._rootPath, file);

            if (pathname.indexOf(this._rootPath) !== 0) {
                reject(new Error(`Directory traversal - ${file}`));
                return;
            }

            const src = this._bucket.file(pathname);
            const gcsStream = src.createWriteStream({
                resumable: false,
                metadata: {
                    cacheControl: 'public, max-age=31536000',
                    contentType: mime,
                },
                gzip: true,
            });

            gcsStream.on('error', () => {
                // eslint-disable-next-line no-console
                // console.log('ERROR', error);
            });

            gcsStream.on('finish', () => {
                // console.log('END');
            });

            resolve(gcsStream);
        });
    }

    read(filePath) {
        const file = super.constructor.validateFilePath(filePath);

        return new Promise((resolve, reject) => {
            const pathname = path.join(this._rootPath, file);

            if (pathname.indexOf(this._rootPath) !== 0) {
                reject(new Error(`Directory traversal - ${file}`));
                return;
            }

            let streamClosed = true;

            const src = this._bucket.file(pathname);
            const gcsStream = src.createReadStream();

            gcsStream.on('readable', () => {
                gcsStream.read();
            });

            gcsStream.on('error', error => {
                if (streamClosed) {
                    reject(error);
                }
            });

            gcsStream.on('response', response => {
                if (response.statusCode === 200) {
                    streamClosed = false;
                    const file = new ReadFile({
                        mimeType: response.headers['content-type'],
                        etag: response.headers.etag,
                    });
                    file.stream = gcsStream;
                    resolve(file);
                } else {
                    reject(new Error(`Could not read file. Got http status code ${response.statusCode} from GCS`));
                }
            });
        });
    }

    delete(filePath) {
        const file = super.constructor.validateFilePath(filePath);

        return new Promise((resolve, reject) => {
            const pathname = path.join(this._rootPath, file);

            if (pathname.indexOf(this._rootPath) !== 0) {
                reject(new Error(`Directory traversal - ${file}`));
                return;
            }

            this._bucket.deleteFiles(
                {
                    prefix: pathname,
                    force: true,
                },
                error => {
                    if (error) return reject(error);
                    return resolve();
                },
            );
        });
    }

    exist(filePath) {
        const file = super.constructor.validateFilePath(filePath);

        return new Promise((resolve, reject) => {
            const pathname = path.join(this._rootPath, file);

            if (pathname.indexOf(this._rootPath) !== 0) {
                reject(new Error(`Directory traversal - ${file}`));
                return;
            }

            const src = this._bucket.file(pathname);

            src.exists((error, exists) => {
                if (error) return reject(error);
                if (exists) return resolve();
                return reject();
            });
        });
    }

    get [Symbol.toStringTag]() {
        return 'SinkGCS';
    }
};
module.exports = SinkGCS;
