export async function register() {
	if (process.env.NEXT_RUNTIME === "nodejs") {
		const { registerTelemetry } =
			await import("./app/telemetry/instrumentation.node.ts");
		registerTelemetry();
	}
}

export async function onRequestError(error?: unknown) {
	if (process.env.NEXT_RUNTIME === "nodejs") {
		const { recordFailure } = await import("./app/telemetry/telemetry.ts");
		recordFailure("website.render", error);
	}
}
