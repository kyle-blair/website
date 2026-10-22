import Fastify from "fastify";
import { recordFailure } from "../../../shared/telemetry.ts";
import bearerAuth from "@fastify/bearer-auth";
import { StorageConflict, type PersistentStorage } from "./postgres-storage.ts";

const maximumKeyLength = 512;

export function createApplication(store: PersistentStorage, token: string) {
	if (!token.trim()) {
		throw new TypeError("A service credential is required.");
	}
	const app = Fastify({
		logger: false,
		bodyLimit: 65536,
		requestTimeout: 10000,
		return503OnClosing: false,
		routerOptions: { maxParamLength: maximumKeyLength * 2 },
	});
	app.addHook("onRequest", async (_request, reply) => {
		reply.header("Cache-Control", "private, no-store");
	});
	app.setErrorHandler((error, _request, reply) => {
		if (error instanceof StorageConflict) {
			return reply.code(409).send({ error: "Storage conflict" });
		}
		const status = (error as { statusCode?: number }).statusCode;
		if (status === 400 || status === 413 || status === 415) {
			return reply
				.code(status)
				.send({ error: "Invalid storage request" });
		}
		recordFailure("storage.request", error);
		return reply.code(503).send({ error: "Storage unavailable" });
	});
	app.get("/health/live", async () => ({ live: true }));
	app.get("/health/ready", async () => {
		await store.check();
		return { ready: true };
	});
	app.register(async (routes) => {
		await routes.register(bearerAuth, {
			keys: new Set([token]),
			errorResponse: () => ({ error: "Unauthorized" }),
		});
		const params = {
			type: "object",
			required: ["key"],
			properties: {
				key: {
					type: "string",
					minLength: 1,
					maxLength: maximumKeyLength,
					pattern: "^[^\\u0000-\\u001f\\u007f]+$",
				},
			},
		};
		routes.get<{ Params: { key: string } }>(
			"/v1/entries/:key",
			{ schema: { params } },
			async (request) => store.read(request.params.key),
		);
		for (const [operation, amount] of [
			["increment", 1],
			["decrement", -1],
		] as const) {
			routes.post<{
				Params: { key: string };
				Body: { operationId: string };
			}>(
				`/v1/entries/:key/${operation}`,
				{
					schema: {
						params,
						body: {
							type: "object",
							required: ["operationId"],
							additionalProperties: false,
							properties: {
								operationId: {
									type: "string",
									pattern:
										"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$",
								},
							},
						},
					},
				},
				async (request) => ({
					value: await store.increment(
						request.params.key,
						request.body.operationId,
						amount,
					),
				}),
			);
		}
	});
	return app;
}
