import { UNKNOWN_NETWORK_ADDRESS } from "../domain/network-address-value.ts";

export class NetworkAddressView {
	protected static readonly loadingGlyphs = ["0", "4", "2"] as const;
	protected readonly loading: boolean;
	protected readonly addressValue: string;

	public constructor(
		isLoading: boolean,
		address: string = UNKNOWN_NETWORK_ADDRESS,
	) {
		if (typeof isLoading !== "boolean") {
			throw new TypeError("The loading state must be a boolean.");
		}
		if (typeof address !== "string" || address.trim().length === 0) {
			throw new TypeError("Network address text must not be empty.");
		}

		this.loading = isLoading;
		this.addressValue = address;
	}

	public get isLoading(): boolean {
		return this.loading;
	}

	public get label(): string {
		return "your network address";
	}

	public get accessibleLabel(): string {
		return this.isLoading ? "Loading address" : this.text;
	}

	public get glyphs(): readonly string[] {
		return NetworkAddressView.loadingGlyphs;
	}

	public get text(): string {
		return this.addressValue === UNKNOWN_NETWORK_ADDRESS
			? "unavailable"
			: this.addressValue;
	}
}
