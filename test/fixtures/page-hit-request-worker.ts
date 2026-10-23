import { parentPort } from "node:worker_threads";
import { PageHitsEndpoint } from "../../src/app/api/page-hits/page-hits-endpoint.ts";

const endpoint = new PageHitsEndpoint(
	async () => {
		throw new Error("Unexpected storage call");
	},
	async () => false,
);

parentPort!.on("message", async (path: string) => {
	const response = await endpoint.handle(
		new Request("https://0.0.0.0:10000/api/page-hits", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				path,
				operationId: "42c26729-670f-4c77-b218-dfb0820ad912",
			}),
		}),
	);
	parentPort!.postMessage(response.status);
});
parentPort!.postMessage("ready");
