import assert from "node:assert/strict";
import { suite, test } from "node:test";
import {
	calculateProcessorUsage,
	summarizeProcessorUsage,
} from "./performance/support/processor-usage.ts";

const before = [
	{ id: 1, type: "browser", cpuTime: 10 },
	{ id: 2, type: "renderer", cpuTime: 20 },
	{ id: 3, type: "GPU", cpuTime: 30 },
	{ id: 4, type: "renderer", cpuTime: 40 },
];
const after = [
	{ id: 4, type: "renderer", cpuTime: 40.25 },
	{ id: 3, type: "GPU", cpuTime: 30.25 },
	{ id: 2, type: "renderer", cpuTime: 20.5 },
	{ id: 1, type: "browser", cpuTime: 11 },
];

suite("Processor usage", () => {
	test("measures processor time across browser processes and expresses use relative to one core", () => {
		const result = calculateProcessorUsage(before, after, 20);
		assert.equal(result.processorSeconds, 2);
		assert.equal(result.percentOfOneCore, 10);
		assert.equal(result.elapsedSeconds, 20);
		assert.deepEqual(result.byProcessType, {
			browser: { processorSeconds: 1, percentOfOneCore: 5 },
			renderer: { processorSeconds: 0.75, percentOfOneCore: 3.75 },
			GPU: { processorSeconds: 0.25, percentOfOneCore: 1.25 },
		});
	});

	test("allows processor use to exceed one core", () => {
		assert.equal(
			calculateProcessorUsage(before, after, 1).percentOfOneCore,
			200,
		);
	});

	test("rejects samples when a process starts, exits, changes type, or resets its counter", () => {
		for (const changed of [
			after.slice(1),
			[...after, { id: 5, type: "renderer", cpuTime: 0 }],
			after.map((process) =>
				process.id === 1 ? { ...process, type: "renderer" } : process,
			),
			after.map((process) =>
				process.id === 1 ? { ...process, cpuTime: 9 } : process,
			),
		]) {
			assert.throws(
				() => calculateProcessorUsage(before, changed, 20),
				/process/i,
			);
		}
	});

	test("rejects empty snapshots and invalid sampling durations instead of reporting a false baseline", () => {
		assert.throws(() => calculateProcessorUsage([], [], 20), /process/i);
		for (const elapsed of [0, -1, NaN, Infinity]) {
			assert.throws(
				() => calculateProcessorUsage(before, after, elapsed),
				/duration/i,
			);
		}
	});

	test("summarizes median and range without allowing a single noisy sample to set the baseline", () => {
		assert.deepEqual(
			summarizeProcessorUsage([
				{ percentOfOneCore: 50 },
				{ percentOfOneCore: 2 },
				{ percentOfOneCore: 3 },
			]),
			{
				medianPercentOfOneCore: 3,
				minimumPercentOfOneCore: 2,
				maximumPercentOfOneCore: 50,
			},
		);
	});

	test("summarizes even sample counts and rejects an empty baseline", () => {
		assert.equal(
			summarizeProcessorUsage([
				{ percentOfOneCore: 2 },
				{ percentOfOneCore: 4 },
			]).medianPercentOfOneCore,
			3,
		);
		assert.throws(() => summarizeProcessorUsage([]), /samples/i);
	});
});
