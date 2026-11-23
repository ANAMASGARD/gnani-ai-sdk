import {
	LoadAPIKeyError,
	NoSuchModelError,
	type ProviderV4,
} from "@ai-sdk/provider";
import { createProviderRegistry } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGnani, GNANI_PROVIDER_ID, gnani } from "../src/index.js";

afterEach(() => vi.unstubAllEnvs());

describe("Gnani provider", () => {
	it("registers both model types in the AI SDK registry", () => {
		expect(GNANI_PROVIDER_ID).toBe("gnani");
		const registry = createProviderRegistry({ gnani });
		expect(registry.speechModel("gnani:timbre-v2.5").specificationVersion).toBe(
			"v4",
		);
		expect(registry.transcriptionModel("gnani:prisma-v3.0").modelId).toBe(
			"prisma-v3.0",
		);
	});
	it("rejects unknown model IDs and unsupported capabilities", () => {
		const provider: ProviderV4 = gnani;
		expect(() => provider.speechModel?.("prisma-v2.5")).toThrow(
			NoSuchModelError,
		);
		expect(() => provider.transcriptionModel?.("timbre-v3.0")).toThrow(
			NoSuchModelError,
		);
		for (const method of [
			"languageModel",
			"imageModel",
			"embeddingModel",
		] as const) {
			expect(() => provider[method]("unknown")).toThrow(NoSuchModelError);
		}
	});
	it("loads the environment key at request time", async () => {
		const fetch = vi
			.fn<typeof globalThis.fetch>()
			.mockResolvedValue(Response.json({ success: true, transcript: "" }));
		const model = createGnani({ fetch }).transcription("prisma-v2.5");
		const input = { audio: new Uint8Array(4), mediaType: "audio/wav" };
		vi.stubEnv("GNANI_API_KEY", undefined);
		await expect(model.doGenerate(input)).rejects.toBeInstanceOf(
			LoadAPIKeyError,
		);
		expect(fetch).not.toHaveBeenCalled();
		vi.stubEnv("GNANI_API_KEY", "environment-key");
		await model.doGenerate(input);
		expect(
			new Headers(fetch.mock.calls[0][1]?.headers).get("X-API-Key-ID"),
		).toBe("environment-key");
	});
});
