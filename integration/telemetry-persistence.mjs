import assert from "node:assert/strict";

const marker = `persistence.${process.argv[2]}`;
const timeUnixNano = String(BigInt(Date.now()) * 1000000n);
const scope = { name: "persistence-test" };
const resource = {
	attributes: [
		{ key: "service.name", value: { stringValue: "persistence-test" } },
	],
};
const signals = {
	traces: {
		resourceSpans: [
			{
				resource,
				scopeSpans: [
					{
						scope,
						spans: [
							{
								traceId: "0123456789abcdef0123456789abcdef",
								spanId: "0123456789abcdef",
								name: marker,
								startTimeUnixNano: timeUnixNano,
								endTimeUnixNano: timeUnixNano,
							},
						],
					},
				],
			},
		],
	},
	metrics: {
		resourceMetrics: [
			{
				resource,
				scopeMetrics: [
					{
						scope,
						metrics: [
							{
								name: marker,
								gauge: {
									dataPoints: [{ timeUnixNano, asDouble: 1 }],
								},
							},
						],
					},
				],
			},
		],
	},
	logs: {
		resourceLogs: [
			{
				resource,
				scopeLogs: [
					{
						scope,
						logRecords: [
							{ timeUnixNano, body: { stringValue: marker } },
						],
					},
				],
			},
		],
	},
};

for (const [signal, data] of Object.entries(signals)) {
	const response = await fetch(`http://telemetry:4318/v1/${signal}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(data),
		signal: AbortSignal.timeout(5000),
	});
	assert.equal(response.status, 200, await response.text());
}
