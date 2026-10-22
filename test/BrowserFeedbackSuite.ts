import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import {
	readFeedbackSelections,
	saveFeedbackSelections,
} from "../src/infrastructure/browser-feedback.ts";

test("stores independent choices and pending operations without a browser identifier", (context) => {
	const dom = new JSDOM("", { url: "https://website.example" });
	const previousWindow = globalThis.window;
	Object.assign(globalThis, { window: dom.window });
	context.after(() => {
		Object.assign(globalThis, { window: previousWindow });
		dom.window.close();
	});
	const saved = {
		choices: { like: true, dislike: false },
		operations: {
			like: {
				reaction: "like" as const,
				selected: false,
				operationId: crypto.randomUUID(),
			},
			dislike: {
				reaction: "dislike" as const,
				selected: true,
				operationId: crypto.randomUUID(),
			},
		},
	};
	saveFeedbackSelections("item:example:first", saved);
	assert.deepEqual(readFeedbackSelections("item:example:first"), saved);
	assert.deepEqual(readFeedbackSelections("item:example:second"), {
		choices: { like: false, dislike: false },
		operations: {},
	});
	assert.equal(dom.window.localStorage.length, 1);
});

test("discards malformed cached feedback instead of sending an invalid operation", (context) => {
	const dom = new JSDOM("", { url: "https://website.example" });
	const previousWindow = globalThis.window;
	Object.assign(globalThis, { window: dom.window });
	context.after(() => {
		Object.assign(globalThis, { window: previousWindow });
		dom.window.close();
	});
	const choices = { like: true, dislike: false };
	const operation = {
		reaction: "like",
		selected: false,
		operationId: crypto.randomUUID(),
	};
	for (const value of [
		"not json",
		"null",
		JSON.stringify({
			choices: { like: "true", dislike: false },
			operations: {},
		}),
		JSON.stringify({ choices: { like: true }, operations: {} }),
		JSON.stringify({ choices, operations: "invalid" }),
		JSON.stringify({ choices, operations: null }),
		JSON.stringify({ choices, operations: [] }),
		...[
			null,
			{ ...operation, reaction: "dislike" },
			{ ...operation, selected: "false" },
			{ ...operation, operationId: 1 },
			{ ...operation, operationId: "invalid" },
		].map((like) => JSON.stringify({ choices, operations: { like } })),
	]) {
		dom.window.localStorage.setItem("feedback:item", value);
		assert.deepEqual(readFeedbackSelections("item"), {
			choices: { like: false, dislike: false },
			operations: {},
		});
	}
});
