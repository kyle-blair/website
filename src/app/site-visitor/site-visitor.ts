import { NetworkAddress } from "./network-address.ts";

export class SiteVisitor {
	protected readonly visitorNetworkAddress: NetworkAddress;

	public constructor(
		networkAddress: NetworkAddress = NetworkAddress.UNKNOWN,
	) {
		if (!(networkAddress instanceof NetworkAddress)) {
			throw new TypeError(
				"A site visitor requires a network address object.",
			);
		}

		this.visitorNetworkAddress = networkAddress;
	}

	public get networkAddress(): NetworkAddress {
		return this.visitorNetworkAddress;
	}
}
