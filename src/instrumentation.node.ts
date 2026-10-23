import { registerOTel } from "@vercel/otel";
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";
import { TelemetryExporter } from "../shared/telemetry-export.ts";
import { initializeMetrics } from "../shared/telemetry.ts";

export function registerTelemetry() {
	try {
		const options = new TelemetryExporter().configuration;
		if (!options) return undefined;
		registerOTel({
			serviceName: "website",
			...options,
			propagators: ["tracecontext"],
			instrumentations: [new UndiciInstrumentation()],
		});
		initializeMetrics();
	} catch {
		process.stderr.write("Telemetry configuration unavailable\n");
	}
}
