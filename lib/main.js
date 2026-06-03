import { Storage } from "@google-cloud/storage";
import { ReadFile } from "@eik/common";
import Metrics from "@metrics/client";
import Sink from "@eik/sink";
import path from "node:path";

const DEFAULT_ROOT_PATH = "eik";
const DEFAULT_BUCKET = "eik_files";

/**
 * @typedef {object} SinkGCSOptions
 * @property {number} [writeTimeout=60_000]
 * @property {boolean} [writeGzip=false]
 * @property {string} [rootPath="eik"]
 * @property {string} [bucket="eik_files"]
 */

/**
 * A sink for uploading files to Google Cloud Storage
 * https://googleapis.dev/nodejs/storage/latest/
 */
const SinkGCS = class SinkGCS extends Sink {
	/**
	 *
	 * @param {import('@google-cloud/storage').StorageOptions} storageOptions
	 * @param {SinkGCSOptions} sinkOptions
	 */
	constructor(
		storageOptions,
		{
			writeTimeout = 60000,
			writeGzip = false,
			rootPath = DEFAULT_ROOT_PATH,
			bucket = DEFAULT_BUCKET,
		} = {},
	) {
		super();
		if (typeof storageOptions !== "object" || storageOptions === null)
			throw new Error('"storageOptions" argument must be provided');
		this._writeTimeout = writeTimeout;
		this._writeGzip = writeGzip;
		this._rootPath = rootPath;
		this._storage = new Storage({
			...storageOptions,
			timeout: writeTimeout,
		});
		this._bucket = this._storage.bucket(bucket);
		this._metrics = new Metrics();
		this._counter = this._metrics.counter({
			name: "eik_core_sink_gcs",
			description: "Counter measuring access to the Google Cloud Storage sink",
			labels: {
				operation: "n/a",
				success: false,
				access: false,
			},
		});
	}

	get metrics() {
		return this._metrics;
	}

	/**
	 * @param {string} filePath
	 * @param {string} contentType
	 * @returns {Promise<import("node:stream").Writable>}
	 */
	write(filePath, contentType) {
		return new Promise((resolve, reject) => {
			const operation = "write";

			try {
				Sink.validateFilePath(filePath);
				Sink.validateContentType(contentType);
			} catch (error) {
				this._counter.inc({ labels: { operation } });
				reject(error);
				return;
			}

			const pathname = path.join(this._rootPath, filePath);

			if (pathname.indexOf(this._rootPath) !== 0) {
				this._counter.inc({ labels: { operation } });
				reject(new Error(`Directory traversal - ${filePath}`));
				return;
			}

			const src = this._bucket.file(pathname);
			const gcsStream = src.createWriteStream({
				resumable: false,
				metadata: {
					cacheControl: "public, max-age=31536000",
					contentType,
				},
				gzip: this._writeGzip,
			});

			gcsStream.on("error", () => {
				this._counter.inc({ labels: { access: true, operation } });
			});

			gcsStream.on("finish", () => {
				this._counter.inc({
					labels: { success: true, access: true, operation },
				});
			});

			resolve(gcsStream);
		});
	}

	/**
	 * @param {string} filePath
	 * @returns {Promise<import("@eik/common").ReadFile>}
	 */
	read(filePath) {
		return new Promise((resolve, reject) => {
			const operation = "read";

			try {
				Sink.validateFilePath(filePath);
			} catch (error) {
				this._counter.inc({ labels: { operation } });
				reject(error);
				return;
			}

			const pathname = path.join(this._rootPath, filePath);

			if (pathname.indexOf(this._rootPath) !== 0) {
				this._counter.inc({ labels: { operation } });
				reject(new Error(`Directory traversal - ${filePath}`));
				return;
			}

			let resolved = false;

			const src = this._bucket.file(pathname);
			const gcsStream = src.createReadStream();

			// The GCS SDK creates streams lazily; resume() triggers the underlying
			// HTTP request without consuming data (we pause() again before resolve).
			gcsStream.resume();

			gcsStream.on("error", (error) => {
				this._counter.inc({ labels: { access: true, operation } });
				if (!resolved) {
					reject(error);
				}
			});

			gcsStream.on("response", (response) => {
				if (response.statusCode === 200) {
					resolved = true;
					// Pause before handing the stream to the consumer. HTTP guarantees
					// response headers arrive before the body, so no body bytes have
					// been emitted yet. pause() buffers them until the consumer pipes.
					gcsStream.pause();
					this._counter.inc({
						labels: { success: true, access: true, operation },
					});
					const obj = new ReadFile({
						mimeType: response.headers["content-type"],
						etag: response.headers.etag,
					});
					obj.stream = gcsStream;
					resolve(obj);
				} else {
					gcsStream.destroy();
					reject(
						new Error(
							`Could not read file. Got http status code ${response.statusCode} from GCS`,
						),
					);
				}
			});
		});
	}

	/**
	 * @param {string} filePath
	 * @returns {Promise<void>}
	 */
	delete(filePath) {
		return new Promise((resolve, reject) => {
			const operation = "delete";

			try {
				Sink.validateFilePath(filePath);
			} catch (error) {
				this._counter.inc({ labels: { operation } });
				reject(error);
				return;
			}

			const pathname = path.join(this._rootPath, filePath);

			if (pathname.indexOf(this._rootPath) !== 0) {
				this._counter.inc({ labels: { operation } });
				reject(new Error(`Directory traversal - ${filePath}`));
				return;
			}

			this._counter.inc({
				labels: { success: true, access: true, operation },
			});

			this._bucket.deleteFiles(
				{
					prefix: pathname,
					force: true,
				},
				(error) => {
					if (error) return reject(error);
					return resolve();
				},
			);
		});
	}

	/**
	 * Resolves if it exists, rejects if not.
	 * @param {string} filePath
	 * @returns {Promise<void>}
	 */
	exist(filePath) {
		return new Promise((resolve, reject) => {
			const operation = "exist";

			try {
				Sink.validateFilePath(filePath);
			} catch (error) {
				this._counter.inc({ labels: { operation } });
				reject(error);
				return;
			}

			const pathname = path.join(this._rootPath, filePath);

			if (pathname.indexOf(this._rootPath) !== 0) {
				this._counter.inc({ labels: { operation } });
				reject(new Error(`Directory traversal - ${filePath}`));
				return;
			}

			this._counter.inc({
				labels: { success: true, access: true, operation },
			});

			const src = this._bucket.file(pathname);

			src.exists(
				(/** @type {Error | null} */ error, /** @type {boolean} */ exists) => {
					if (error) return reject(error);
					if (exists) return resolve();
					return reject(new Error("File does not exist"));
				},
			);
		});
	}

	get [Symbol.toStringTag]() {
		return "SinkGCS";
	}
};
export default SinkGCS;
