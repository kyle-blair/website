export class PostNotFoundError extends Error {
	public constructor(slug: string) {
		super(
			`No post was found with the slug "${slug}". Check the slug against the published posts and try again.`,
		);
		this.name = "PostNotFoundError";
	}
}
