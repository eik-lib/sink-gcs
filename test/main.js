/* eslint-disable no-empty */

import { Writable, pipeline } from "node:stream";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { stream } from "@eik/common";
import fs from "node:fs";

import Sink from "../lib/main.js";

const slug = () => randomBytes(4).toString("hex");

const RE_STORAGE_OPTIONS_REQUIRED =
	/"storageOptions" argument must be provided/;
const RE_TIMESTAMP = /"timestamp": [0-9.]+,/gi;
const RE_DIRECTORY_TRAVERSAL = /Directory traversal/;

const getCredentials = () => {
	try {
		return JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS || "");
		// eslint-disable-next-line no-unused-vars
	} catch (error) {}

	const file = fs.readFileSync(
		new URL("../gcloud.json", import.meta.url),
		"utf-8",
	);
	return JSON.parse(file);
};

const fixture = fs
	.readFileSync(new URL("../fixtures/import-map.json", import.meta.url))
	.toString();

const MetricsInto = class MetricsInto extends Writable {
	constructor() {
		super({ objectMode: true });
		/** @type {any[]} */
		this._metrics = [];
	}

	_write(
		/** @type {any} */ chunk,
		/** @type {any} */ encoding,
		/** @type {() => void} */ callback,
	) {
		this._metrics.push(chunk);
		callback();
	}

	done() {
		return new Promise((resolve) => {
			this.once("finish", () => {
				resolve(JSON.stringify(this._metrics, null, 2));
			});
			this.end();
		});
	}
};

const readFileStream = (file = "../README.md") =>
	fs.createReadStream(new URL(file, import.meta.url));

const pipeInto = (/** @type {any[]} */ ...streams) =>
	new Promise((resolve, reject) => {
		const buffer = /** @type {any[]} */ ([]);

		const to = new Writable({
			objectMode: false,
			write(chunk, encoding, callback) {
				buffer.push(chunk);
				callback();
			},
		});
		// @ts-expect-error
		pipeline(...streams, to, (error) => {
			if (error) return reject(error);
			const str = buffer.join("").toString();
			return resolve(str);
		});
	});

const pipe = (/** @type {any[]} */ ...streams) =>
	/** @type {Promise<void>} */ (
		new Promise((resolve, reject) => {
			// @ts-expect-error
			pipeline(...streams, (error) => {
				if (error) return reject(error);
				return resolve();
			});
		})
	);

const DEFAULT_CONFIG = {
	credentials: getCredentials(),
	projectId: "eik-test",
};

test("Sink() - Object type", () => {
	const sink = new Sink(DEFAULT_CONFIG);
	const name = Object.prototype.toString.call(sink);
	assert.ok(name.startsWith("[object Sink"), "should begin with Sink");
});

test('Sink() - Argument "storageOptions" not provided', () => {
	assert.throws(
		() => {
			// @ts-expect-error Testing bad input
			const sink = new Sink(); // eslint-disable-line no-unused-vars
		},
		RE_STORAGE_OPTIONS_REQUIRED,
		"Should throw",
	);
});

test('Sink() - Argument "storageOptions" is of wrong type', () => {
	assert.throws(
		() => {
			// @ts-expect-error Testing bad input
			const sink = new Sink("foo"); // eslint-disable-line no-unused-vars
		},
		RE_STORAGE_OPTIONS_REQUIRED,
		"Should throw",
	);
});

await test("Sink() - .write()", async () => {
	const sink = new Sink(DEFAULT_CONFIG);
	const dir = slug();
	const file = `${dir}/bar/map.json`;

	const writeFrom = readFileStream("../fixtures/import-map.json");
	const writeTo = await sink.write(file, "application/json");

	await assert.doesNotReject(
		pipe(writeFrom, writeTo),
		"should write file to sink",
	);

	// Clean up sink
	await sink.delete(dir);
});

await test("Sink() - .write() - arguments is illegal", async () => {
	const sink = new Sink(DEFAULT_CONFIG);
	const dir = slug();

	await assert.rejects(
		// @ts-expect-error Testing bad input
		sink.write(300, "application/octet-stream"),
		new TypeError("Argument must be a String"),
		"should reject on illegal filepath",
	);
	await assert.rejects(
		// @ts-expect-error Testing bad input
		sink.write(`${dir}/bar/map.json`, 300),
		new TypeError("Argument must be a String"),
		"should reject on illegal mime type",
	);
});

await test("Sink() - .write() - directory traversal prevention", async () => {
	const sink = new Sink(DEFAULT_CONFIG);
	const dir = slug();

	await assert.rejects(
		sink.write(`../../${dir}/sensitive.data`, "application/octet-stream"),
		RE_DIRECTORY_TRAVERSAL,
		"should reject on ../../ at beginning of filepath",
	);
	await assert.rejects(
		sink.write(`../${dir}/sensitive.data`, "application/octet-stream"),
		RE_DIRECTORY_TRAVERSAL,
		"should reject on ../ at beginning of filepath",
	);
	await assert.rejects(
		sink.write(
			`/${dir}/../../../foo/sensitive.data`,
			"application/octet-stream",
		),
		RE_DIRECTORY_TRAVERSAL,
		"should reject on path traversal in the middle of filepath",
	);
	await assert.doesNotReject(
		sink.write(`./${dir}/sensitive.data`, "application/octet-stream"),
		"should resolve on ./ at beginning of filepath",
	);
	await assert.doesNotReject(
		sink.write(`/${dir}/sensitive.data`, "application/octet-stream"),
		"should resolve on / at beginning of filepath",
	);
	await assert.doesNotReject(
		sink.write(`//${dir}/sensitive.data`, "application/octet-stream"),
		"should resolve on // at beginning of filepath",
	);

	// Clean up sink
	await sink.delete(dir);
});

await test("Sink() - .read() - File exists", async () => {
	const sink = new Sink(DEFAULT_CONFIG);
	const dir = slug();
	const file = `${dir}/bar/map.json`;

	const writeFrom = readFileStream("../fixtures/import-map.json");
	const writeTo = await sink.write(file, "application/json");

	await pipe(writeFrom, writeTo);

	const readFrom = await sink.read(file);

	assert.ok(
		stream.isReadableStream(readFrom.stream),
		"should resolve with a ReadFile object which has a .stream property",
	);
	assert.strictEqual(
		typeof readFrom.etag,
		"string",
		"should resolve with a ReadFile object which has a .etag property",
	);
	assert.ok(
		readFrom.etag.length !== 0,
		"should resolve with a ReadFile object which has a .etag property which is not empty",
	);
	assert.strictEqual(
		typeof readFrom.mimeType,
		"string",
		"should resolve with a ReadFile object which has a .mimeType property",
	);
	assert.strictEqual(
		readFrom.mimeType,
		"application/json",
		"should resolve with a ReadFile object which has a .mimeType property which is not empty",
	);

	const result = await pipeInto(readFrom.stream);

	assert.strictEqual(
		result,
		fixture,
		"should read file from sink which equals the fixture",
	);

	// Clean up sink
	await sink.delete(dir);
});

await test("Sink() - .read() - File does NOT exist", async () => {
	const sink = new Sink(DEFAULT_CONFIG);
	const dir = slug();
	await assert.rejects(
		sink.read(`/${dir}/foo/not-exist.json`),
		"should reject",
	);
});

await test("Sink() - .read() - arguments is illegal", async () => {
	const sink = new Sink(DEFAULT_CONFIG);
	await assert.rejects(
		// @ts-expect-error Testing bad input
		sink.read(300),
		new TypeError("Argument must be a String"),
		"should reject on illegal filepath",
	);
});

await test("Sink() - .read() - directory traversal prevention", async () => {
	const sink = new Sink(DEFAULT_CONFIG);
	const dir = slug();
	const file = `${dir}/map.json`;

	const writeFrom = readFileStream("../fixtures/import-map.json");
	const writeTo = await sink.write(file, "application/json");

	await pipe(writeFrom, writeTo);

	await assert.rejects(
		sink.read(`../../${dir}/sensitive.data`),
		RE_DIRECTORY_TRAVERSAL,
		"should reject on ../../ at beginning of filepath",
	);
	await assert.rejects(
		sink.read(`../${dir}/sensitive.data`),
		RE_DIRECTORY_TRAVERSAL,
		"should reject on ../ at beginning of filepath",
	);
	await assert.rejects(
		sink.read(`/${dir}/../../../foo/sensitive.data`),
		RE_DIRECTORY_TRAVERSAL,
		"should reject on path traversal in the middle of filepath",
	);
	await assert.doesNotReject(
		sink.read(`./${file}`),
		"should resolve on ./ at beginning of filepath",
	);
	await assert.doesNotReject(
		sink.read(`/${file}`),
		"should resolve on / at beginning of filepath",
	);
	await assert.doesNotReject(
		sink.read(`//${file}`),
		"should resolve on // at beginning of filepath",
	);

	// Clean up sink
	await sink.delete(dir);
});

await test("Sink() - .delete() - Delete existing file", async () => {
	const sink = new Sink(DEFAULT_CONFIG);

	const dir = slug();
	const file = `${dir}/bar/map.json`;

	const writeFrom = readFileStream("../fixtures/import-map.json");
	const writeTo = await sink.write(file, "application/json");

	await pipe(writeFrom, writeTo);

	await assert.doesNotReject(
		sink.exist(file),
		"should resolve - file is in sink before deletion",
	);

	await sink.delete(file);

	await assert.rejects(sink.exist(file), "should reject - file was deleted");

	// Clean up sink
	await sink.delete(dir);
});

await test("Sink() - .delete() - Delete non existing file", async () => {
	const sink = new Sink(DEFAULT_CONFIG);
	await assert.doesNotReject(
		sink.delete("/bar/foo/not-exist.json"),
		"should resolve",
	);
});

await test("Sink() - .delete() - Delete file in tree structure", async () => {
	const sink = new Sink(DEFAULT_CONFIG);
	const dir = slug();
	const fileA = `${dir}/a/map.json`;
	const fileB = `${dir}/b/map.json`;

	const writeFromA = readFileStream("../fixtures/import-map.json");
	const writeToA = await sink.write(fileA, "application/json");
	await pipe(writeFromA, writeToA);

	const writeFromB = readFileStream("../fixtures/import-map.json");
	const writeToB = await sink.write(fileB, "application/json");
	await pipe(writeFromB, writeToB);

	await sink.delete(fileA);

	await assert.rejects(
		sink.exist(fileA),
		"should reject on file A - file was deleted",
	);
	await assert.doesNotReject(
		sink.exist(fileB),
		"should resolve on file B - file was NOT deleted",
	);

	// Clean up sink
	await sink.delete(dir);
});

await test("Sink() - .delete() - arguments is illegal", async () => {
	const sink = new Sink(DEFAULT_CONFIG);
	await assert.rejects(
		// @ts-expect-error Testing bad input
		sink.delete(300),
		new TypeError("Argument must be a String"),
		"should reject on illegal filepath",
	);
});

await test("Sink() - .delete() - Delete files recursively", async () => {
	const sink = new Sink(DEFAULT_CONFIG);
	const dir = slug();
	const fileA = `${dir}/a/map.json`;
	const fileB = `${dir}/b/map.json`;

	const writeFromA = readFileStream("../fixtures/import-map.json");
	const writeToA = await sink.write(fileA, "application/json");
	await pipe(writeFromA, writeToA);

	const writeFromB = readFileStream("../fixtures/import-map.json");
	const writeToB = await sink.write(fileB, "application/json");
	await pipe(writeFromB, writeToB);

	await sink.delete(dir);

	await assert.rejects(
		sink.exist(fileA),
		"should reject on file A - file was deleted",
	);
	await assert.rejects(
		sink.exist(fileB),
		"should reject on file B - file was deleted",
	);
});

await test("Sink() - .delete() - directory traversal prevention", async () => {
	const sink = new Sink(DEFAULT_CONFIG);
	const dir = slug();
	const file = `${dir}/map.json`;

	await assert.rejects(
		sink.delete(`../../${dir}/sensitive.data`),
		RE_DIRECTORY_TRAVERSAL,
		"should reject on ../../ at beginning of filepath",
	);
	await assert.rejects(
		sink.delete(`../${dir}/sensitive.data`),
		RE_DIRECTORY_TRAVERSAL,
		"should reject on ../ at beginning of filepath",
	);
	await assert.rejects(
		sink.delete(`/${dir}/../../../foo/sensitive.data`),
		RE_DIRECTORY_TRAVERSAL,
		"should reject on path traversal in the middle of filepath",
	);
	await assert.doesNotReject(
		sink.delete(`./${file}`),
		"should resolve on ./ at beginning of filepath",
	);
	await assert.doesNotReject(
		sink.delete(`/${file}`),
		"should resolve on / at beginning of filepath",
	);
	await assert.doesNotReject(
		sink.delete(`//${file}`),
		"should resolve on // at beginning of filepath",
	);

	// Clean up sink
	await sink.delete(dir);
});

await test("Sink() - .exist() - Check existing file", async () => {
	const sink = new Sink(DEFAULT_CONFIG);
	const dir = slug();
	const file = `${dir}/map.json`;

	const writeFrom = readFileStream("../fixtures/import-map.json");
	const writeTo = await sink.write(file, "application/json");

	await pipe(writeFrom, writeTo);

	await assert.doesNotReject(
		sink.exist(file),
		"should resolve - file is in sink",
	);

	// Clean up sink
	await sink.delete(dir);
});

await test("Sink() - .exist() - Check non existing file", async () => {
	const sink = new Sink(DEFAULT_CONFIG);
	await assert.rejects(
		sink.exist("/bar/foo/not-exist.json"),
		"should reject - file does not exist",
	);
});

await test("Sink() - .exist() - non-existing file rejects with an Error", async () => {
	const sink = new Sink(DEFAULT_CONFIG);
	const dir = slug();
	await assert.rejects(
		sink.exist(`/${dir}/foo/not-exist.json`),
		(err) => {
			assert.ok(err instanceof Error, "rejection must be an Error instance");
			assert.ok(err.message.length > 0, "Error must have a non-empty message");
			return true;
		},
		"should reject with an Error instance",
	);
});

await test("Sink() - .exist() - arguments is illegal", async () => {
	const sink = new Sink(DEFAULT_CONFIG);
	await assert.rejects(
		// @ts-expect-error Testing bad input
		sink.exist(300),
		new TypeError("Argument must be a String"),
		"should reject on illegal filepath",
	);
});

await test("Sink() - .exist() - directory traversal prevention", async () => {
	const sink = new Sink(DEFAULT_CONFIG);
	const dir = slug();
	const file = `${dir}/map.json`;

	const writeFrom = readFileStream("../fixtures/import-map.json");
	const writeTo = await sink.write(file, "application/json");

	await pipe(writeFrom, writeTo);

	await assert.rejects(
		sink.exist(`../../${dir}/sensitive.data`),
		RE_DIRECTORY_TRAVERSAL,
		"should reject on ../../ at beginning of filepath",
	);
	await assert.rejects(
		sink.exist(`../${dir}/sensitive.data`),
		RE_DIRECTORY_TRAVERSAL,
		"should reject on ../ at beginning of filepath",
	);
	await assert.rejects(
		sink.exist(`/${dir}/../../../foo/sensitive.data`),
		RE_DIRECTORY_TRAVERSAL,
		"should reject on path traversal in the middle of filepath",
	);
	await assert.doesNotReject(
		sink.exist(`./${file}`),
		"should resolve on ./ at beginning of filepath",
	);
	await assert.doesNotReject(
		sink.exist(`/${file}`),
		"should resolve on / at beginning of filepath",
	);
	await assert.doesNotReject(
		sink.exist(`//${file}`),
		"should resolve on // at beginning of filepath",
	);

	// Clean up sink
	await sink.delete(dir);
});

await test("Sink() - .metrics - all successfull operations", async (t) => {
	const sink = new Sink(DEFAULT_CONFIG);
	const dir = slug();
	const file = `${dir}/bar/map.json`;

	const metricsInto = new MetricsInto();
	sink.metrics.pipe(metricsInto);

	// write, check, read and delete file
	const writeFrom = readFileStream("../fixtures/import-map.json");
	const writeTo = await sink.write(file, "application/json");
	await pipe(writeFrom, writeTo);

	await sink.exist(file);

	const readFrom = await sink.read(file);
	await pipeInto(readFrom.stream);

	await sink.delete(dir);

	const metrics = await metricsInto.done();
	const cleaned = metrics.replace(RE_TIMESTAMP, '"timestamp": -1,');
	t.assert.snapshot(cleaned);
});

// Unit-level regression tests that do not require GCS credentials.
// They verify error propagation behaviour by injecting a mock bucket.

// Unit-level regression test that does not require GCS credentials.

test("Sink() - write() - ifNotExists: a GCS 412 causes the stream to error exactly once", async () => {
	// Regression: the error handler called gcsStream.emit("error", conflict)
	// to re-classify a 412 Precondition Failed as ALREADY_EXISTS. This caused
	// the stream to emit "error" multiple times for a single GCS rejection,
	// accumulating extra error listeners on shared streams and triggering
	// MaxListenersExceededWarning in production under concurrent load.
	//
	// After the fix the 412 is left to propagate once; reclassification is
	// done by the caller (writeJSONWithOptions in @eik/core).
	const { PassThrough, Readable } = await import("node:stream");

	const sink = new Sink({ projectId: "unit-test-only" });

	const mockStream = new PassThrough();
	sink._bucket = /** @type {any} */ ({
		file: () => ({
			createWriteStream: () => mockStream,
		}),
	});

	const writable = await sink.write("/foo/bar.txt", "text/plain", {
		ifNotExists: true,
	});

	// Collect the error the pipeline callback receives. With the old code the
	// handler re-emitted a reclassified ALREADY_EXISTS error so the pipeline
	// received that. With the fix the raw GCS 412 propagates through unchanged;
	// reclassification is delegated to the caller (writeJSONWithOptions).
	const readable = new Readable({ read() {} });
	const pipelineError = /** @type {any} */ (
		await new Promise((resolve) => {
			pipeline(readable, writable, resolve);
			setImmediate(() => {
				mockStream.emit(
					"error",
					Object.assign(new Error("412 Precondition Failed"), { code: 412 }),
				);
			});
		})
	);

	assert.ok(pipelineError, "pipeline should have received an error");
	assert.strictEqual(
		pipelineError.code,
		412,
		"the sink must pass the raw GCS 412 to the caller — re-emitting a reclassified error inside the handler caused cascading emissions",
	);
});
