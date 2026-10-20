import assert from "node:assert/strict";
import { suite, test } from "node:test";
import { NetworkAddress } from "../src/domain/network-address.ts";

class ConstructibleNetworkAddress extends NetworkAddress {
	public constructor(value: string) {
		super(value);
	}
}

suite("NetworkAddress", () => {
	for (const value of ["203.0.113.7", "2001:db8::42", "::ffff:192.0.2.7"]) {
		test(`represents the valid network address ${value}`, () => {
			const headers = new Headers({ "x-forwarded-for": value });
			const address = NetworkAddress.fromHeaders(headers);
			assert.ok(address instanceof NetworkAddress);
			assert.equal(address.value, value);
			assert.equal(address.isKnown, true);
		});
	}

	test("removes surrounding whitespace", () => {
		const headers = new Headers({ "x-forwarded-for": " 203.0.113.7 " });
		assert.equal(NetworkAddress.fromHeaders(headers).value, "203.0.113.7");
	});

	test("represents an unknown address with a shared placeholder", () => {
		assert.ok(NetworkAddress.UNKNOWN instanceof NetworkAddress);
		assert.equal(NetworkAddress.UNKNOWN.value, "unknown");
		assert.equal(NetworkAddress.UNKNOWN.isKnown, false);
	});

	for (const value of [
		null,
		"",
		" ",
		"not an address",
		"999.0.0.1",
		"2001:::42",
	]) {
		test(`returns the unknown address for ${JSON.stringify(value)}`, () => {
			const headers = new Headers();
			if (value !== null) {
				headers.set("x-forwarded-for", value);
			}
			assert.equal(
				NetworkAddress.fromHeaders(headers),
				NetworkAddress.UNKNOWN,
			);
		});
	}

	for (const value of ["", " ", "not an address", "999.0.0.1", "2001:::42"]) {
		test(`rejects construction with ${JSON.stringify(value)}`, () => {
			assert.throws(
				() => new ConstructibleNetworkAddress(value),
				TypeError,
			);
		});
	}
});
