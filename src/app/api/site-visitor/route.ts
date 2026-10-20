import { connection } from "next/server";
import { NetworkAddress } from "@/domain/network-address";
import { SiteVisitor } from "@/domain/site-visitor";

export async function GET(request: Request) {
	await connection();
	const visitor = new SiteVisitor(
		NetworkAddress.fromHeaders(request.headers),
	);

	return Response.json(
		{ networkAddress: visitor.networkAddress.value },
		{
			headers: {
				"Cache-Control": "private, max-age=300",
			},
		},
	);
}
