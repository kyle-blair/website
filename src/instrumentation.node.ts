import { registerOTel } from "@vercel/otel";
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";
import { telemetryOptions } from "../shared/telemetry-export.ts";
import { initializeMetrics } from "../shared/telemetry.ts";

export function registerTelemetry() {
	try {
		registerOTel({
			serviceName: "website",
			...telemetryOptions(),
			propagators: ["tracecontext"],
			instrumentations: [new UndiciInstrumentation()],
		});
		initializeMetrics();
	} catch {
		process.stderr.write("Telemetry configuration unavailable\n");
	}
}
