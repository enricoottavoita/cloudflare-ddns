import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("GET /health", () => {
	it("returns ok: true", async () => {
		const response = await SELF.fetch("http://localhost/health");
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
	});
});
