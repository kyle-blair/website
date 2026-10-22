import type { PersistentStorage } from "./persistent-storage.ts";

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
	private readonly storage: PersistentStorage;
	public constructor(subject: string, storage: PersistentStorage) {
		if (!Feedback.isValidSubject(subject))
			throw new TypeError("Feedback requires a subject identifier.");
		if (
			!storage ||
			typeof storage.read !== "function" ||
			typeof storage.increment !== "function"
		)
			throw new TypeError("Feedback requires persistent storage.");
		this.subject = subject;
		this.storage = storage;
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
		const entries = await Promise.all([
			this.storage.read(`likes:${this.subject}`),
			this.storage.read(`dislikes:${this.subject}`),
		]);
		const counts = entries.map((entry) => (entry.found ? entry.value : 0));
		return new FeedbackTotals(counts[0] as number, counts[1] as number);
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
		await this.storage.increment(
			`${reaction === "like" ? "likes" : "dislikes"}:${this.subject}`,
			operationId,
			selected ? 1 : -1,
		);
		return this.read();
	}
}
