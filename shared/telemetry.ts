import {
	context,
	metrics,
	SpanStatusCode,
	trace,
	type Counter,
	type Histogram,
} from "@opentelemetry/api";
import { logs, SeverityNumber } from "@opentelemetry/api-logs";

let operations: Counter | undefined;
let duration: Histogram | undefined;

export function initializeMetrics() {
	const meter = metrics.getMeter("website");
	operations = meter.createCounter("website.operations", {
		description: "Completed application operations",
	});
	duration = meter.createHistogram("website.operation.duration", {
		unit: "s",
		description: "Application operation duration",
		advice: {
			explicitBucketBoundaries: [
				0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1, 2.5,
				5, 7.5, 10,
			],
		},
	});
}

export function recordOperation(
	operation: string,
	seconds: number,
	outcome: string,
	status?: number,
) {
	const attributes = {
		"operation.name": operation,
		"operation.outcome": outcome,
		...(status === undefined
			? {}
			: { "http.response.status_code": status }),
	};
	operations?.add(1, attributes);
	duration?.record(seconds, attributes);
}

export function recordFailure(operation: string, error?: unknown) {
	const failure = error instanceof Error ? error : undefined;
	const candidate = failure as (Error & { code?: unknown }) | undefined;
	const cause = failure?.cause as { code?: unknown } | undefined;
	const code = candidate?.code ?? cause?.code;
	const codes = [
		"ECONNREFUSED",
		"ECONNRESET",
		"ETIMEDOUT",
		"ENOTFOUND",
		"EAI_AGAIN",
		"EPIPE",
		"CERT_HAS_EXPIRED",
		"DEPTH_ZERO_SELF_SIGNED_CERT",
		"UNABLE_TO_VERIFY_LEAF_SIGNATURE",
		"ERR_TLS_CERT_ALTNAME_INVALID",
		"08001",
		"08006",
		"28P01",
		"3D000",
		"42P01",
		"42501",
		"53300",
		"57P01",
		"57P03",
		"23505",
		"22003",
	];
	const types = [
		"Error",
		"TypeError",
		"RangeError",
		"SyntaxError",
		"TimeoutError",
		"AbortError",
		"AggregateError",
	];
	const attributes = {
		"operation.name": operation,
		"operation.outcome": "error",
		"error.type":
			failure && types.includes(failure.name) ? failure.name : "Error",
		...(typeof code === "string" && codes.includes(code)
			? { "error.code": code }
			: {}),
	};
	const span = trace.getSpan(context.active());
	span?.setStatus({ code: SpanStatusCode.ERROR });
	span?.setAttributes(attributes);
	logs.getLogger("website").emit({
		severityNumber: SeverityNumber.ERROR,
		severityText: "ERROR",
		body: "Operation unavailable",
		attributes,
	});
}

export async function observe<T>(
	operation: string,
	action: () => Promise<T>,
): Promise<T> {
	return trace
		.getTracer("website")
		.startActiveSpan(
			operation,
			{ attributes: { "operation.name": operation } },
			async (span) => {
				const started = performance.now();
				let outcome = "success";
				try {
					const result = await action();
					if (result instanceof Response) {
						span.setAttribute(
							"http.response.status_code",
							result.status,
						);
						if (result.status >= 500) {
							outcome = "unavailable";
							recordFailure(operation);
						}
					}
					return result;
				} catch (error) {
					outcome = "error";
					recordFailure(operation, error);
					throw error;
				} finally {
					span.setAttribute("operation.outcome", outcome);
					recordOperation(
						operation,
						(performance.now() - started) / 1000,
						outcome,
					);
					span.end();
				}
			},
		);
}
