import assert from "node:assert/strict";

export type BrowserProcess = {
	id: number;
	type: string;
	cpuTime: number;
};

export function calculateProcessorUsage(
	before: BrowserProcess[],
	after: BrowserProcess[],
	elapsedSeconds: number,
) {
	assert.ok(
		Number.isFinite(elapsedSeconds) && elapsedSeconds > 0,
		"The sampling duration must be positive and finite. Repeat the measurement.",
	);
	assert.ok(
		before.length > 0,
		"No browser processes were reported. Repeat the measurement.",
	);
	assert.equal(
		after.length,
		before.length,
		"The browser process list changed during sampling. Repeat the measurement after the browser settles.",
	);
	const initialProcesses = new Map(
		before.map((process) => [process.id, process]),
	);
	const byProcessType: Record<
		string,
		{ processorSeconds: number; percentOfOneCore: number }
	> = {};
	let processorSeconds = 0;
	for (const process of after) {
		const initial = initialProcesses.get(process.id);
		assert.ok(
			initial && initial.type === process.type,
			"A browser process changed during sampling. Repeat the measurement after the browser settles.",
		);
		const seconds = process.cpuTime - initial.cpuTime;
		assert.ok(
			Number.isFinite(seconds) && seconds >= 0,
			"A browser process counter reset during sampling. Repeat the measurement.",
		);
		processorSeconds += seconds;
		const totals = byProcessType[process.type] ?? {
			processorSeconds: 0,
			percentOfOneCore: 0,
		};
		totals.processorSeconds += seconds;
		totals.percentOfOneCore =
			(totals.processorSeconds / elapsedSeconds) * 100;
		byProcessType[process.type] = totals;
	}
	return {
		elapsedSeconds,
		processorSeconds,
		percentOfOneCore: (processorSeconds / elapsedSeconds) * 100,
		byProcessType,
	};
}

export function summarizeProcessorUsage(
	samples: { percentOfOneCore: number }[],
) {
	assert.ok(
		samples.length > 0,
		"No processor samples were collected. Run the performance test again.",
	);
	const values = samples
		.map((sample) => sample.percentOfOneCore)
		.sort((left, right) => left - right);
	return {
		medianPercentOfOneCore:
			(values[Math.floor((values.length - 1) / 2)] +
				values[Math.floor(values.length / 2)]) /
			2,
		minimumPercentOfOneCore: values[0],
		maximumPercentOfOneCore: values[values.length - 1],
	};
}
