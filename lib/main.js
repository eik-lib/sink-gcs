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
		this._storage = new Storage(storageOptions);
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
				timeout: this._writeTimeout,
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

			let streamClosed = true;

			const src = this._bucket.file(pathname);
			const gcsStream = src.createReadStream();

			gcsStream.on("readable", () => {
				gcsStream.read();
			});

			gcsStream.on("error", (error) => {
				if (streamClosed) {
					this._counter.inc({ labels: { access: true, operation } });
					reject(error);
				}
			});

			gcsStream.on("response", (response) => {
				this._counter.inc({
					labels: { success: true, access: true, operation },
				});

				if (response.statusCode === 200) {
					streamClosed = false;
					const obj = new ReadFile({
						mimeType: response.headers["content-type"],
						etag: response.headers.etag,
					});
					obj.stream = gcsStream;
					resolve(obj);
				} else {
					reject(
						new Error(
							`Could not read file. Got http status code ${response.statusCode} from GCS`,
						),
					);
				}
			});
		});
	}

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

			src.exists((error, exists) => {
				if (error) return reject(error);
				if (exists) return resolve();
				return reject();
			});
		});
	}

	get [Symbol.toStringTag]() {
		return "SinkGCS";
	}
};
export default SinkGCS;
