import { inspect } from "node:util";
import { SeverityNumber } from "@opentelemetry/api-logs";
import { TelemetryEndpointNotConfiguredError } from "./telemetry-export.ts";

export class TelemetryInitializationLog {
	private readonly component: "traces" | "metrics" | "logs" | "telemetry";
	private readonly error: unknown;

	constructor(
		component: "traces" | "metrics" | "logs" | "telemetry",
		error: unknown,
	) {
		this.component = component;
		this.error = error;
	}

	write() {
		const unconfigured =
			this.error instanceof TelemetryEndpointNotConfiguredError;
		console.log(
			JSON.stringify({
				timestamp: new Date().toISOString(),
				severityNumber: unconfigured
					? SeverityNumber.INFO
					: SeverityNumber.ERROR,
				severityText: unconfigured ? "INFO" : "ERROR",
				component: this.component,
				body: unconfigured
					? "Telemetry initialization was skipped because no export endpoint is configured."
					: "Telemetry initialization failed. Review the error details to determine the corrective action.",
				error: inspect(this.error, { depth: null }),
			}),
		);
	}
}
