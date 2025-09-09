/* eslint-disable no-empty */

import { Writable, pipeline } from "node:stream";
import { stream } from "@eik/common";
import slug from "unique-slug";
import tap from "tap";
import fs from "node:fs";

import Sink from "../lib/main.js";

// Ignore the value for "timestamp" field in the snapshots
tap.cleanSnapshot = (s) => {
	const regex = /"timestamp": [0-9.]+,/gi;
	return s.replace(regex, '"timestamp": -1,');
};

const getCredentials = () => {
	try {
		return JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS);
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
		this._metrics = [];
	}

	_write(chunk, encoding, callback) {
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

const pipeInto = (...streams) =>
	new Promise((resolve, reject) => {
		const buffer = [];

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

const pipe = (...streams) =>
	/** @type {Promise<void>} */ (
		new Promise((resolve, reject) => {
			// @ts-expect-error
			pipeline(...streams, (error) => {
				if (error) {
					console.error(error);
					return reject(error);
				}
				return resolve();
			});
		})
	);

const DEFAULT_CONFIG = {
	credentials: getCredentials(),
	projectId: "eik-test",
};

tap.test("Sink() - Object type", (t) => {
	const sink = new Sink(DEFAULT_CONFIG);
	const name = Object.prototype.toString.call(sink);
	t.ok(name.startsWith("[object Sink"), "should begin with Sink");
	t.end();
});

tap.test('Sink() - Argument "storageOptions" not provided', (t) => {
	t.plan(1);
	t.throws(
		() => {
			// @ts-expect-error Testing bad input
			const sink = new Sink(); // eslint-disable-line no-unused-vars
		},
		/"storageOptions" argument must be provided/,
		"Should throw",
	);
	t.end();
});

tap.test('Sink() - Argument "storageOptions" is of wrong type', (t) => {
	t.plan(1);
	t.throws(
		() => {
			// @ts-expect-error Testing bad input
			const sink = new Sink("foo"); // eslint-disable-line no-unused-vars
		},
		/"storageOptions" argument must be provided/,
		"Should throw",
	);
	t.end();
});

await tap.test("Sink() - .write()", async (t) => {
	const sink = new Sink(DEFAULT_CONFIG);
	const dir = slug();
	const file = `${dir}/bar/map.json`;

	const writeFrom = readFileStream("../fixtures/import-map.json");
	const writeTo = await sink.write(file, "application/json");

	await t.resolves(pipe(writeFrom, writeTo), "should write file to sink");

	// Clean up sink
	await sink.delete(dir);
});

await tap.test("Sink() - .write() - arguments is illegal", async (t) => {
	const sink = new Sink(DEFAULT_CONFIG);
	const dir = slug();

	await t.rejects(
		sink.write(300, "application/octet-stream"),
		new TypeError("Argument must be a String"),
		"should reject on illegal filepath",
	);
	await t.rejects(
		sink.write(`${dir}/bar/map.json`, 300),
		new TypeError("Argument must be a String"),
		"should reject on illegal mime type",
	);
});

await tap.test("Sink() - .write() - timeout", async (t) => {
	const sink = new Sink(DEFAULT_CONFIG, {
		writeTimeout: 40,
	});
	const dir = slug();
	const file = `${dir}/bar/map.json`;

	const writeFrom = readFileStream("../fixtures/import-map.json");
	const writeTo = await sink.write(file, "application/json");

	await t.rejects(
		pipe(writeFrom, writeTo),
		/timeout/,
		"should reject on timeout",
	);
});

await tap.test(
	"Sink() - .write() - directory traversal prevention",
	async (t) => {
		const sink = new Sink(DEFAULT_CONFIG);
		const dir = slug();

		await t.rejects(
			sink.write(`../../${dir}/sensitive.data`, "application/octet-stream"),
			new Error("Directory traversal"),
			"should reject on ../../ at beginning of filepath",
		);
		await t.rejects(
			sink.write(`../${dir}/sensitive.data`, "application/octet-stream"),
			new Error("Directory traversal"),
			"should reject on ../ at beginning of filepath",
		);
		await t.rejects(
			sink.write(
				`/${dir}/../../../foo/sensitive.data`,
				"application/octet-stream",
			),
			new Error("Directory traversal"),
			"should reject on path traversal in the middle of filepath",
		);
		await t.resolves(
			sink.write(`./${dir}/sensitive.data`, "application/octet-stream"),
			"should resolve on ./ at beginning of filepath",
		);
		await t.resolves(
			sink.write(`/${dir}/sensitive.data`, "application/octet-stream"),
			"should resolve on / at beginning of filepath",
		);
		await t.resolves(
			sink.write(`//${dir}/sensitive.data`, "application/octet-stream"),
			"should resolve on // at beginning of filepath",
		);

		// Clean up sink
		await sink.delete(dir);
	},
);

await tap.test("Sink() - .read() - File exists", async (t) => {
	const sink = new Sink(DEFAULT_CONFIG);
	const dir = slug();
	const file = `${dir}/bar/map.json`;

	const writeFrom = readFileStream("../fixtures/import-map.json");
	const writeTo = await sink.write(file, "application/json");

	await pipe(writeFrom, writeTo);

	const readFrom = await sink.read(file);

	t.ok(
		stream.isReadableStream(readFrom.stream),
		"should resolve with a ReadFile object which has a .stream property",
	);
	t.type(
		readFrom.etag,
		"string",
		"should resolve with a ReadFile object which has a .etag property",
	);
	t.ok(
		readFrom.etag.length !== 0,
		"should resolve with a ReadFile object which has a .etag property which is not empty",
	);
	t.type(
		readFrom.mimeType,
		"string",
		"should resolve with a ReadFile object which has a .mimeType property",
	);
	t.equal(
		readFrom.mimeType,
		"application/json",
		"should resolve with a ReadFile object which has a .mimeType property which is not empty",
	);

	const result = await pipeInto(readFrom.stream);

	t.equal(
		result,
		fixture,
		"should read file from sink which equals the fixture",
	);

	// Clean up sink
	await sink.delete(dir);
});

await tap.test("Sink() - .read() - File does NOT exist", async (t) => {
	const sink = new Sink(DEFAULT_CONFIG);
	const dir = slug();
	await t.rejects(sink.read(`/${dir}/foo/not-exist.json`), "should reject");
});

await tap.test("Sink() - .read() - arguments is illegal", async (t) => {
	const sink = new Sink(DEFAULT_CONFIG);
	await t.rejects(
		sink.read(300),
		new TypeError("Argument must be a String"),
		"should reject on illegal filepath",
	);
});

await tap.test(
	"Sink() - .read() - directory traversal prevention",
	async (t) => {
		const sink = new Sink(DEFAULT_CONFIG);
		const dir = slug();
		const file = `${dir}/map.json`;

		const writeFrom = readFileStream("../fixtures/import-map.json");
		const writeTo = await sink.write(file, "application/json");

		await pipe(writeFrom, writeTo);

		await t.rejects(
			sink.read(`../../${dir}/sensitive.data`),
			new Error("Directory traversal"),
			"should reject on ../../ at beginning of filepath",
		);
		await t.rejects(
			sink.read(`../${dir}/sensitive.data`),
			new Error("Directory traversal"),
			"should reject on ../ at beginning of filepath",
		);
		await t.rejects(
			sink.read(`/${dir}/../../../foo/sensitive.data`),
			new Error("Directory traversal"),
			"should reject on path traversal in the middle of filepath",
		);
		await t.resolves(
			sink.read(`./${file}`),
			"should resolve on ./ at beginning of filepath",
		);
		await t.resolves(
			sink.read(`/${file}`),
			"should resolve on / at beginning of filepath",
		);
		await t.resolves(
			sink.read(`//${file}`),
			"should resolve on // at beginning of filepath",
		);

		// Clean up sink
		await sink.delete(dir);
	},
);

await tap.test("Sink() - .delete() - Delete existing file", async (t) => {
	const sink = new Sink(DEFAULT_CONFIG);

	const dir = slug();
	const file = `${dir}/bar/map.json`;

	const writeFrom = readFileStream("../fixtures/import-map.json");
	const writeTo = await sink.write(file, "application/json");

	await pipe(writeFrom, writeTo);

	await t.resolves(
		sink.exist(file),
		"should resolve - file is in sink before deletion",
	);

	await sink.delete(file);

	await t.rejects(sink.exist(file), "should reject - file was deleted");

	// Clean up sink
	await sink.delete(dir);
});

await tap.test("Sink() - .delete() - Delete non existing file", async (t) => {
	const sink = new Sink(DEFAULT_CONFIG);
	await t.resolves(sink.delete("/bar/foo/not-exist.json"), "should resolve");
});

await tap.test(
	"Sink() - .delete() - Delete file in tree structure",
	async (t) => {
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

		await t.rejects(
			sink.exist(fileA),
			"should reject on file A - file was deleted",
		);
		await t.resolves(
			sink.exist(fileB),
			"should resolve on file B - file was NOT deleted",
		);

		// Clean up sink
		await sink.delete(dir);
	},
);

await tap.test("Sink() - .delete() - arguments is illegal", async (t) => {
	const sink = new Sink(DEFAULT_CONFIG);
	await t.rejects(
		sink.delete(300),
		new TypeError("Argument must be a String"),
		"should reject on illegal filepath",
	);
});

await tap.test("Sink() - .delete() - Delete files recursively", async (t) => {
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

	await t.rejects(
		sink.exist(fileA),
		"should reject on file A - file was deleted",
	);
	await t.rejects(
		sink.exist(fileB),
		"should reject on file B - file was deleted",
	);
});

await tap.test(
	"Sink() - .delete() - directory traversal prevention",
	async (t) => {
		const sink = new Sink(DEFAULT_CONFIG);
		const dir = slug();
		const file = `${dir}/map.json`;

		await t.rejects(
			sink.delete(`../../${dir}/sensitive.data`),
			new Error("Directory traversal"),
			"should reject on ../../ at beginning of filepath",
		);
		await t.rejects(
			sink.delete(`../${dir}/sensitive.data`),
			new Error("Directory traversal"),
			"should reject on ../ at beginning of filepath",
		);
		await t.rejects(
			sink.delete(`/${dir}/../../../foo/sensitive.data`),
			new Error("Directory traversal"),
			"should reject on path traversal in the middle of filepath",
		);
		await t.resolves(
			sink.delete(`./${file}`),
			"should resolve on ./ at beginning of filepath",
		);
		await t.resolves(
			sink.delete(`/${file}`),
			"should resolve on / at beginning of filepath",
		);
		await t.resolves(
			sink.delete(`//${file}`),
			"should resolve on // at beginning of filepath",
		);

		// Clean up sink
		await sink.delete(dir);
	},
);

await tap.test("Sink() - .exist() - Check existing file", async (t) => {
	const sink = new Sink(DEFAULT_CONFIG);
	const dir = slug();
	const file = `${dir}/map.json`;

	const writeFrom = readFileStream("../fixtures/import-map.json");
	const writeTo = await sink.write(file, "application/json");

	await pipe(writeFrom, writeTo);

	await t.resolves(sink.exist(file), "should resolve - file is in sink");

	// Clean up sink
	await sink.delete(dir);
});

await tap.test("Sink() - .exist() - Check non existing file", async (t) => {
	const sink = new Sink(DEFAULT_CONFIG);
	await t.rejects(
		sink.exist("/bar/foo/not-exist.json"),
		"should reject - file does not exist",
	);
});

await tap.test("Sink() - .exist() - arguments is illegal", async (t) => {
	const sink = new Sink(DEFAULT_CONFIG);
	await t.rejects(
		sink.exist(300),
		new TypeError("Argument must be a String"),
		"should reject on illegal filepath",
	);
});

await tap.test(
	"Sink() - .exist() - directory traversal prevention",
	async (t) => {
		const sink = new Sink(DEFAULT_CONFIG);
		const dir = slug();
		const file = `${dir}/map.json`;

		const writeFrom = readFileStream("../fixtures/import-map.json");
		const writeTo = await sink.write(file, "application/json");

		await pipe(writeFrom, writeTo);

		await t.rejects(
			sink.exist(`../../${dir}/sensitive.data`),
			new Error("Directory traversal"),
			"should reject on ../../ at beginning of filepath",
		);
		await t.rejects(
			sink.exist(`../${dir}/sensitive.data`),
			new Error("Directory traversal"),
			"should reject on ../ at beginning of filepath",
		);
		await t.rejects(
			sink.exist(`/${dir}/../../../foo/sensitive.data`),
			new Error("Directory traversal"),
			"should reject on path traversal in the middle of filepath",
		);
		await t.resolves(
			sink.exist(`./${file}`),
			"should resolve on ./ at beginning of filepath",
		);
		await t.resolves(
			sink.exist(`/${file}`),
			"should resolve on / at beginning of filepath",
		);
		await t.resolves(
			sink.exist(`//${file}`),
			"should resolve on // at beginning of filepath",
		);

		// Clean up sink
		await sink.delete(dir);
	},
);

await tap.test("Sink() - .metrics - all successfull operations", async (t) => {
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
	t.matchSnapshot(metrics, "metrics should match snapshot");
});
