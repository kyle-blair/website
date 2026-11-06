export class Post {
	readonly #title: string;
	readonly #slug: string;
	readonly #content: string;
	readonly #publishedAt: Date;
	readonly #lastModifiedAt: Date;

	public constructor(
		title: string,
		content: string,
		publishedAt: Date,
		lastModifiedAt: Date = publishedAt,
	) {
		const slug = title
			.normalize("NFKD")
			.replace(/\p{M}/gu, "")
			.toLowerCase()
			.replace(/[^\p{L}\p{N}]+/gu, "-")
			.replace(/^-+|-+$/g, "");
		if (!slug) {
			throw new TypeError(
				"The post title must contain letters or numbers. Supply a title that identifies the post.",
			);
		}
		for (const [field, value] of [
			["publishedAt", publishedAt],
			["lastModifiedAt", lastModifiedAt],
		] as const) {
			if (Number.isNaN(value.getTime())) {
				throw new TypeError(
					`The post ${field} must be a valid Date object. Supply a Date representing the intended timestamp.`,
				);
			}
		}
		this.#title = title;
		this.#slug = slug;
		this.#content = content;
		this.#publishedAt = new Date(publishedAt.getTime());
		this.#lastModifiedAt = new Date(lastModifiedAt.getTime());
		Object.freeze(this);
	}

	public compareTo(other: Post): number {
		return (
			other.#publishedAt.getTime() - this.#publishedAt.getTime() ||
			this.#title.localeCompare(other.#title)
		);
	}

	public getTitle(): string {
		return this.#title;
	}

	public getSlug(): string {
		return this.#slug;
	}

	public getContent(): string {
		return this.#content;
	}

	public getPublishedAt(): Date {
		return new Date(this.#publishedAt.getTime());
	}

	public getLastModifiedAt(): Date {
		return new Date(this.#lastModifiedAt.getTime());
	}
}
