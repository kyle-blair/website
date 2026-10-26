import type { CounterStore } from "./counter-store.ts";

export type Reaction = "like" | "dislike";

export class FeedbackTotals {
	public readonly likes: number;
	public readonly dislikes: number;
	public constructor(likes: number, dislikes: number) {
		if (
			!Number.isSafeInteger(likes) ||
			likes < 0 ||
			!Number.isSafeInteger(dislikes) ||
			dislikes < 0
		)
			throw new TypeError(
				"Feedback counts must be nonnegative safe integers.",
			);
		this.likes = likes;
		this.dislikes = dislikes;
	}
	public static from(value: unknown): FeedbackTotals {
		if (typeof value !== "object" || value === null)
			throw new TypeError("Invalid feedback totals.");
		const totals = value as Record<string, unknown>;
		return new FeedbackTotals(
			totals.likes as number,
			totals.dislikes as number,
		);
	}
	public get score() {
		return this.likes - this.dislikes;
	}
	public get scoreText() {
		return new Intl.NumberFormat("en-US", {
			signDisplay: "exceptZero",
		}).format(this.score);
	}
}

export class Feedback {
	private readonly subject: string;
	private readonly counters: CounterStore;
	public constructor(subject: string, counters: CounterStore) {
		if (!Feedback.isValidSubject(subject))
			throw new TypeError("Feedback requires a subject identifier.");
		if (
			!counters ||
			typeof counters.read !== "function" ||
			typeof counters.adjust !== "function"
		)
			throw new TypeError("Feedback requires a counter store.");
		this.subject = subject;
		this.counters = counters;
	}
	public static isValidSubject(subject: unknown): subject is string {
		return (
			typeof subject === "string" &&
			subject.length > 0 &&
			subject.length <= 500 &&
			subject.trim() === subject &&
			!/[\u0000-\u001f\u007f]/.test(subject)
		);
	}
	public async read(): Promise<FeedbackTotals> {
		const counts = await Promise.all([
			this.counters.read(`likes:${this.subject}`),
			this.counters.read(`dislikes:${this.subject}`),
		]);
		return new FeedbackTotals(counts[0], counts[1]);
	}
	public async record(
		reaction: Reaction,
		operationId: string,
		selected = true,
	): Promise<FeedbackTotals> {
		if (
			(reaction !== "like" && reaction !== "dislike") ||
			typeof selected !== "boolean"
		)
			throw new TypeError("Invalid feedback reaction.");
		await this.counters.adjust(
			`${reaction === "like" ? "likes" : "dislikes"}:${this.subject}`,
			operationId,
			selected ? 1 : -1,
		);
		return this.read();
	}
}
