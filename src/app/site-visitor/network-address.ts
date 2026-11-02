import { isIP } from "node:net";
import { UNKNOWN_NETWORK_ADDRESS } from "./network-address-value.ts";

export class NetworkAddress {
	public static readonly UNKNOWN = new NetworkAddress(
		UNKNOWN_NETWORK_ADDRESS,
	);
	protected readonly addressValue: string;

	protected constructor(value: string) {
		if (value !== UNKNOWN_NETWORK_ADDRESS && isIP(value) === 0) {
			throw new TypeError("Invalid network address.");
		}

		this.addressValue = value;
	}

	public static fromHeaders(headers: Pick<Headers, "get">): NetworkAddress {
		const forwardedHeader = headers.get("forwarded");
		let reportedAddress: string | null;

		if (forwardedHeader !== null) {
			reportedAddress = this.removePortAndBrackets(
				this.getFirstForwardedAddress(forwardedHeader),
			);
		} else {
			reportedAddress =
				headers.get("x-real-ip") ??
				headers.get("x-forwarded-for")?.split(",", 1)[0] ??
				null;
		}

		const normalizedAddress = reportedAddress?.trim();
		if (!normalizedAddress || isIP(normalizedAddress) === 0) {
			return NetworkAddress.UNKNOWN;
		}

		return new NetworkAddress(normalizedAddress);
	}

	public get value(): string {
		return this.addressValue;
	}

	public get isKnown(): boolean {
		return this.addressValue !== UNKNOWN_NETWORK_ADDRESS;
	}

	protected static getFirstForwardedAddress(
		forwardedHeader: string,
	): string | null {
		const headerToken = /[!#$%&'*+\-.^_`|~0-9a-z]+/.source;
		const quotedHeaderValue = /"((?:[^"\\]|\\.)*)"/.source;
		const nextParameter = new RegExp(
			`\\s*(${headerToken})=(?:${quotedHeaderValue}|(${headerToken}))\\s*(;|,|$)`,
			"iy",
		);
		let firstForwardedAddress: string | null = null;
		let parameterMatch: RegExpExecArray | null;

		while (
			(parameterMatch = nextParameter.exec(forwardedHeader)) !== null
		) {
			const [, parameterName, quotedValue, tokenValue, delimiter] =
				parameterMatch;

			if (parameterName.toLowerCase() === "for") {
				if (firstForwardedAddress !== null) {
					return null;
				}

				firstForwardedAddress =
					quotedValue === undefined
						? tokenValue
						: quotedValue.replace(/\\(.)/g, "$1");
			}

			if (delimiter !== ";") {
				return firstForwardedAddress;
			}
		}

		return null;
	}

	protected static removePortAndBrackets(
		forwardedAddress: string | null,
	): string | null {
		if (forwardedAddress === null) {
			return null;
		}

		const bracketedVersionSixAddress = /\[([a-f\d:.]+)\]/.source;
		const versionFourAddress = /(\d{1,3}(?:\.\d{1,3}){3})/.source;
		const optionalPort = /(?::(?:\d{1,5}|_[a-z\d._-]+))?/.source;
		const addressWithOptionalPort = new RegExp(
			`^(?:${bracketedVersionSixAddress}|${versionFourAddress})${optionalPort}$`,
			"i",
		);
		const [, versionSixValue, versionFourValue] =
			forwardedAddress.match(addressWithOptionalPort) ?? [];

		return versionSixValue ?? versionFourValue ?? null;
	}
}
