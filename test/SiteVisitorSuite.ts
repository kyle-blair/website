import assert from "node:assert/strict";
import { suite, test } from "node:test";
import { NetworkAddress } from "../src/domain/network-address.ts";
import { SiteVisitor } from "../src/domain/site-visitor.ts";

suite("SiteVisitor", () => {
	test("exposes the visitor's network address", () => {
		const headers = new Headers({ "x-forwarded-for": "203.0.113.7" });
		const address = NetworkAddress.fromHeaders(headers);
		assert.ok(address);
		const visitor = new SiteVisitor(address);
		assert.equal(visitor.networkAddress, address);
	});

	test("represents a visitor whose network address is unavailable", () => {
		assert.equal(new SiteVisitor().networkAddress, NetworkAddress.UNKNOWN);
		assert.equal(
			new SiteVisitor(NetworkAddress.UNKNOWN).networkAddress,
			NetworkAddress.UNKNOWN,
		);
	});

	test("rejects construction without a network address object", () => {
		assert.throws(
			() => new SiteVisitor(null as unknown as NetworkAddress),
			TypeError,
		);
	});
});
