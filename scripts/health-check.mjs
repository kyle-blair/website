import { inspect } from "node:util";

const url = process.argv[2];

function writeLog(severityNumber, severityText, body, details) {
	const output = JSON.stringify({
		timestamp: new Date().toISOString(),
		severityNumber,
		severityText,
		body,
		url,
		...details,
	});
	if (severityText === "ERROR") console.error(output);
	else console.log(output);
}

try {
	const response = await fetch(url, {
		signal: AbortSignal.timeout(2000),
	});
	if (response.ok) {
		writeLog(9, "INFO", "The health check succeeded.", {
			status: response.status,
		});
	} else {
		writeLog(
			17,
			"ERROR",
			"The health check received an unsuccessful response. Check the service logs to determine why the endpoint is failing.",
			{ status: response.status },
		);
		process.exitCode = 1;
	}
} catch (error) {
	writeLog(
		17,
		"ERROR",
		"The health check request failed. Check that the endpoint is reachable and responds within two seconds, and review the error details.",
		{ error: inspect(error, { depth: null }) },
	);
	process.exitCode = 1;
}
