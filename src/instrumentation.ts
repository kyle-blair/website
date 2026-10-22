export async function register() {
	if (process.env.NEXT_RUNTIME === "nodejs") {
		const { registerTelemetry } = await import("./instrumentation.node.ts");
		registerTelemetry();
	}
}

export async function onRequestError(error?: unknown) {
	if (process.env.NEXT_RUNTIME === "nodejs") {
		const { recordFailure } = await import("../shared/telemetry.ts");
		recordFailure("website.render", error);
	}
}
