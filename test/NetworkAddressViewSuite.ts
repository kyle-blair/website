import assert from "node:assert/strict";
import { suite, test } from "node:test";
import { NetworkAddressView } from "../src/components/network-address-view.ts";
import { NetworkAddress } from "../src/domain/network-address.ts";

suite("NetworkAddressView", () => {
	test("uses an accessible matrix-style signal while loading", () => {
		const view = new NetworkAddressView(true);
		assert.equal(view.isLoading, true);
		assert.equal(view.label, "your network address");
		assert.equal(view.accessibleLabel, "Loading address");
		assert.deepEqual(view.glyphs, ["0", "4", "2"]);
	});

	test("shows the resolved address", () => {
		const view = new NetworkAddressView(false, "203.0.113.7");
		assert.equal(view.isLoading, false);
		assert.equal(view.text, "203.0.113.7");
		assert.equal(view.accessibleLabel, "203.0.113.7");
	});

	test("shows an unavailable fallback", () => {
		const view = new NetworkAddressView(
			false,
			NetworkAddress.UNKNOWN.value,
		);
		assert.equal(view.isLoading, false);
		assert.equal(view.text, "unavailable");
		assert.equal(view.accessibleLabel, "unavailable");
	});

	test("defaults to the unknown address", () => {
		assert.equal(new NetworkAddressView(false).text, "unavailable");
	});

	for (const value of ["", " ", null]) {
		test(`rejects invalid address text ${JSON.stringify(value)}`, () => {
			assert.throws(
				() => new NetworkAddressView(false, value as unknown as string),
				TypeError,
			);
		});
	}

	test("rejects an invalid loading state", () => {
		assert.throws(
			() => new NetworkAddressView("loading" as unknown as boolean),
			TypeError,
		);
	});
});
