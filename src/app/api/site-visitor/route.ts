import { connection } from "next/server";
import { NetworkAddress } from "@/site-visitor/network-address";
import { SiteVisitor } from "@/site-visitor/site-visitor";

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
