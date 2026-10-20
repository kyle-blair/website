import assert from "node:assert/strict";
import { suite, test } from "node:test";
import { NetworkAddress } from "../src/domain/network-address.ts";

suite("NetworkAddress.fromHeaders", () => {
	test("returns the original address from a forwarded address chain", () => {
		const headers = new Headers({
			"x-forwarded-for": "203.0.113.7, 198.51.100.90",
		});

		assert.equal(NetworkAddress.fromHeaders(headers).value, "203.0.113.7");
	});

	test("supports an Internet Protocol version 6 address", () => {
		const headers = new Headers({ "x-forwarded-for": "2001:db8::42" });

		assert.equal(NetworkAddress.fromHeaders(headers).value, "2001:db8::42");
	});

	test("returns the unknown address when the selected value is invalid", () => {
		const headers = new Headers({ "x-forwarded-for": "not an address" });

		assert.equal(
			NetworkAddress.fromHeaders(headers),
			NetworkAddress.UNKNOWN,
		);
	});

	test("returns the unknown address when address headers are absent", () => {
		assert.equal(
			NetworkAddress.fromHeaders(new Headers()),
			NetworkAddress.UNKNOWN,
		);
	});

	for (const [description, values, expected] of [
		[
			"a direct version 4 connection normalized by Next.js",
			{ "x-forwarded-for": "127.0.0.1" },
			"127.0.0.1",
		],
		[
			"a direct version 6 connection normalized by Next.js",
			{ "x-forwarded-for": "::1" },
			"::1",
		],
		[
			"a version 4 address mapped into version 6",
			{ "x-forwarded-for": "::ffff:192.0.2.7" },
			"::ffff:192.0.2.7",
		],
		[
			"whitespace around the original address",
			{ "x-forwarded-for": " 203.0.113.7 , 198.51.100.90" },
			"203.0.113.7",
		],
		[
			"several forwarding intermediaries",
			{ "x-forwarded-for": "203.0.113.7, 198.51.100.90, 192.0.2.1" },
			"203.0.113.7",
		],
		[
			"an invalid original address followed by a valid intermediary",
			{ "x-forwarded-for": "unknown, 192.0.2.1" },
			NetworkAddress.UNKNOWN,
		],
		[
			"an empty original address",
			{ "x-forwarded-for": ", 192.0.2.1" },
			NetworkAddress.UNKNOWN,
		],
		[
			"an empty forwarded header",
			{ "x-forwarded-for": "" },
			NetworkAddress.UNKNOWN,
		],
		[
			"a standardized forwarded address",
			{ forwarded: "for=203.0.113.7" },
			"203.0.113.7",
		],
		[
			"a quoted standardized address",
			{ forwarded: 'for="203.0.113.7";proto=https' },
			"203.0.113.7",
		],
		[
			"a standardized version 4 address with a port",
			{ forwarded: 'for="203.0.113.7:43210"' },
			"203.0.113.7",
		],
		[
			"a standardized version 6 address",
			{ forwarded: 'for="[2001:db8::42]"' },
			"2001:db8::42",
		],
		[
			"a standardized version 6 address with a port",
			{ forwarded: 'for="[2001:db8::42]:43210"' },
			"2001:db8::42",
		],
		[
			"a standardized address with an obfuscated port",
			{ forwarded: 'for="[2001:db8::42]:_hidden"' },
			"2001:db8::42",
		],
		[
			"case-insensitive forwarded parameters",
			{ Forwarded: "For=203.0.113.7;Proto=https" },
			"203.0.113.7",
		],
		[
			"a standardized forwarding chain",
			{ forwarded: 'for=203.0.113.7;by=192.0.2.1, for="[2001:db8::1]"' },
			"203.0.113.7",
		],
		[
			"a comma inside another quoted parameter",
			{
				forwarded:
					'host="example.test,internal";for=203.0.113.7, for=192.0.2.1',
			},
			"203.0.113.7",
		],
		[
			"an escaped quote inside another parameter",
			{ forwarded: 'host="example\\\";for=192.0.2.99";for=203.0.113.7' },
			"203.0.113.7",
		],
		[
			"an unknown original address",
			{
				forwarded: "for=unknown, for=192.0.2.1",
				"x-forwarded-for": "192.0.2.2",
			},
			NetworkAddress.UNKNOWN,
		],
		[
			"an obfuscated original address",
			{ forwarded: "for=_hidden" },
			NetworkAddress.UNKNOWN,
		],
		[
			"a missing original address parameter",
			{ forwarded: "by=192.0.2.1, for=203.0.113.7" },
			NetworkAddress.UNKNOWN,
		],
		[
			"a malformed standardized header",
			{ forwarded: 'for="203.0.113.7' },
			NetworkAddress.UNKNOWN,
		],
		[
			"an empty standardized header",
			{ forwarded: "" },
			NetworkAddress.UNKNOWN,
		],
		[
			"an invalid standardized address",
			{ forwarded: "for=not-an-address" },
			NetworkAddress.UNKNOWN,
		],
		[
			"an invalid version 4 address",
			{ forwarded: "for=999.0.0.1" },
			NetworkAddress.UNKNOWN,
		],
		[
			"an invalid version 6 address",
			{ forwarded: 'for="[2001:::42]"' },
			NetworkAddress.UNKNOWN,
		],
		[
			"duplicate original address parameters",
			{ forwarded: "for=203.0.113.7;for=192.0.2.1" },
			NetworkAddress.UNKNOWN,
		],
		[
			"a malformed parameter after the original address",
			{ forwarded: "for=203.0.113.7;broken" },
			NetworkAddress.UNKNOWN,
		],
		[
			"a quoted empty original address",
			{ forwarded: 'for=""' },
			NetworkAddress.UNKNOWN,
		],
		[
			"a real-address header",
			{ "x-real-ip": "203.0.113.7" },
			"203.0.113.7",
		],
		[
			"a real-address version 6 header",
			{ "x-real-ip": "2001:db8::42" },
			"2001:db8::42",
		],
		[
			"an invalid real-address header",
			{ "x-real-ip": "not an address" },
			NetworkAddress.UNKNOWN,
		],
		[
			"a standardized address instead of a normalized socket address",
			{ forwarded: "for=203.0.113.7", "x-forwarded-for": "192.0.2.1" },
			"203.0.113.7",
		],
		[
			"a real address instead of a normalized socket address",
			{ "x-real-ip": "203.0.113.7", "x-forwarded-for": "192.0.2.1" },
			"203.0.113.7",
		],
		[
			"a standardized address when all formats are present",
			{
				forwarded: "for=203.0.113.7",
				"x-real-ip": "198.51.100.90",
				"x-forwarded-for": "192.0.2.1",
			},
			"203.0.113.7",
		],
	] satisfies Array<
		[string, Record<string, string>, string | NetworkAddress]
	>) {
		test(`handles ${description}`, () => {
			const address = NetworkAddress.fromHeaders(new Headers(values));
			if (typeof expected === "string") {
				assert.equal(address.value, expected);
			} else {
				assert.equal(address, expected);
			}
		});
	}
});
