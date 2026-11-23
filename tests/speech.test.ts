import { UnsupportedFunctionalityError } from "@ai-sdk/provider";
import { generateSpeech } from "ai";
import { describe, expect, it, vi } from "vitest";
import { createGnani } from "../src/index.js";

// Same unknown-length RIFF and data fields as live Timbre REST responses.
const wav = Uint8Array.from(
	Buffer.from(
		"52494646ffffffff57415645666d74201000000001000100803e0000007d00000200100064617461ffffffff07000800",
		"hex",
	),
);

describe("Timbre", () => {
	it.each([
		["timbre-v2.5", "Nalini"],
		["timbre-v3.0", "Shivani"],
	] as const)(
		"generates playable WAV with the default voice for %s",
		async (modelId, voice) => {
			const fetch = vi
				.fn<typeof globalThis.fetch>()
				.mockResolvedValue(
					new Response(wav, { headers: { "Content-Type": "audio/wav" } }),
				);
			const { audio, responses } = await generateSpeech({
				model: createGnani({ apiKey: "key", fetch }).speech(modelId),
				text: "नमस्ते",
			});
			const request = new Request(...fetch.mock.calls[0]);
			expect([request.method, request.url]).toEqual([
				"POST",
				"https://api.vachana.ai/api/v1/tts/inference",
			]);
			expect(request.headers.get("X-API-Key-ID")).toBe("key");
			expect(request.headers.get("content-type")).toBe("application/json");
			expect(await request.json()).toEqual({
				text: "नमस्ते",
				model: modelId,
				voice,
				language: "auto",
				audio_config: { container: "wav" },
			});
			expect(audio.mediaType).toBe("audio/wav");
			const data = Buffer.from(audio.uint8Array);
			expect(data.readUInt32LE(4)).toBe(data.length - 8);
			expect(data.readUInt32LE(40)).toBe(4);
			expect(data.subarray(44)).toEqual(Buffer.from(wav.subarray(44)));
			expect(responses[0].modelId).toBe(modelId);
		},
	);
	it("passes SDK controls and Gnani audio options separately", async () => {
		const mp3 = new Uint8Array([0xff, 0xfb, 0x90, 0, 1, 2]);
		const fetch = vi
			.fn<typeof globalThis.fetch>()
			.mockResolvedValue(
				new Response(mp3, { headers: { "Content-Type": "audio/mpeg" } }),
			);
		const signal = new AbortController().signal;
		const text = "<whispers> नमस्ते";
		const { audio, warnings } = await createGnani({ apiKey: "key", fetch })
			.speech("timbre-v3.0")
			.doGenerate({
				text,
				voice: "Avinash",
				language: "hi",
				speed: 1.2,
				outputFormat: "mp3",
				instructions: "Speak softly",
				abortSignal: signal,
				providerOptions: {
					gnani: { audio_config: { sample_rate: 24000, bitrate: "64k" } },
				},
			});
		expect(fetch.mock.calls[0][1]?.signal).toBe(signal);
		expect(await new Request(...fetch.mock.calls[0]).json()).toEqual({
			text,
			model: "timbre-v3.0",
			voice: "Avinash",
			language: "hi-IN",
			speed: 1.2,
			audio_config: { sample_rate: 24000, bitrate: "64k", container: "mp3" },
		});
		expect(audio).toEqual(mp3);
		expect(warnings).toMatchObject([
			{ type: "unsupported", feature: "instructions" },
		]);
	});
	it.each([
		["pcm", "raw", "application/octet-stream", "audio/pcm"],
		["opus", "ogg", "audio/ogg", "audio/ogg"],
		["mulaw", "mulaw", "audio/basic", "audio/basic"],
		["alaw", "alaw", "audio/alaw", "audio/alaw"],
	])(
		"maps %s to its Gnani container",
		async (format, container, contentType, mediaType) => {
			const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
				new Response(new Uint8Array([1, 2, 3]), {
					headers: { "content-type": contentType },
				}),
			);
			const { audio } = await generateSpeech({
				model: createGnani({ apiKey: "key", fetch }).speech("timbre-v2.5"),
				text: "hello",
				outputFormat: format,
			});
			expect(
				(await new Request(...fetch.mock.calls[0]).json()).audio_config
					.container,
			).toBe(container);
			expect(audio.mediaType).toBe(mediaType);
		},
	);
	it("rejects unsupported output formats before synthesis", async () => {
		const fetch = vi.fn<typeof globalThis.fetch>();
		await expect(
			generateSpeech({
				model: createGnani({ apiKey: "key", fetch }).speech("timbre-v3.0"),
				text: "hello",
				outputFormat: "aac",
			}),
		).rejects.toBeInstanceOf(UnsupportedFunctionalityError);
		expect(fetch).not.toHaveBeenCalled();
	});
	it.each([
		[
			400,
			() =>
				Response.json(
					{ success: false, message: "bad voice" },
					{ status: 400 },
				),
			"bad voice",
		],
		[
			200,
			() => Response.json({ success: false, message: "synthesis failed" }),
			"synthesis failed",
		],
		[
			200,
			() =>
				new Response(new Uint8Array(), {
					headers: { "content-type": "audio/wav" },
				}),
			"Expected a non-empty audio",
		],
		[
			200,
			() =>
				new Response("<html>error</html>", {
					headers: { "content-type": "text/html" },
				}),
			"Expected a non-empty audio",
		],
	] as const)(
		"rejects an unusable response with HTTP %i",
		async (status, response, message) => {
			const gnani = createGnani({
				apiKey: "key",
				fetch: async () => response(),
			});
			await expect(
				generateSpeech({
					model: gnani.speech("timbre-v3.0"),
					text: "hello",
					maxRetries: 0,
				}),
			).rejects.toMatchObject({
				name: "AI_APICallError",
				statusCode: status,
				message: expect.stringContaining(message),
			});
		},
	);
});
