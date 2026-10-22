import type { Reaction } from "../domain/feedback.ts";

export type FeedbackVote = {
	reaction: Reaction;
	selected: boolean;
	operationId: string;
};

export type FeedbackSelections = {
	choices: Record<Reaction, boolean>;
	operations: Partial<Record<Reaction, FeedbackVote>>;
};

export function readFeedbackSelections(subject: string): FeedbackSelections {
	try {
		const saved = JSON.parse(
			window.localStorage.getItem(`feedback:${subject}`) ?? "null",
		);
		if (
			typeof saved?.choices?.like !== "boolean" ||
			typeof saved.choices.dislike !== "boolean" ||
			typeof saved.operations !== "object" ||
			saved.operations === null ||
			Array.isArray(saved.operations)
		)
			throw new TypeError("Invalid stored feedback.");
		const operations: FeedbackSelections["operations"] = {};
		for (const reaction of ["like", "dislike"] as const) {
			const operation = saved.operations[reaction];
			if (operation === undefined) continue;
			if (
				operation?.reaction !== reaction ||
				typeof operation.selected !== "boolean" ||
				typeof operation.operationId !== "string" ||
				!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
					operation.operationId,
				)
			)
				throw new TypeError("Invalid stored feedback operation.");
			operations[reaction] = {
				reaction,
				selected: operation.selected,
				operationId: operation.operationId,
			};
		}
		return {
			choices: {
				like: saved.choices.like,
				dislike: saved.choices.dislike,
			},
			operations,
		};
	} catch {
		return { choices: { like: false, dislike: false }, operations: {} };
	}
}

export function saveFeedbackSelections(
	subject: string,
	selections: FeedbackSelections,
): void {
	window.localStorage.setItem(
		`feedback:${subject}`,
		JSON.stringify(selections),
	);
}
