import {
	InvalidArgumentError,
	UnsupportedFunctionalityError,
} from "@ai-sdk/provider";
import { transcribe } from "ai";
import { describe, expect, it, vi } from "vitest";
import { createGnani } from "../src/index.js";

const audio = new Uint8Array([0x4f, 0x67, 0x67, 0x53, 1, 2, 3]);
const emptyResponse = () => Response.json({ success: true, transcript: "" });

describe("Prisma", () => {
	it.each([
		["prisma-v2.5", "en-IN"],
		["prisma-v3.0", "indic-auto"],
	] as const)(
		"uploads bytes with the correct extension and defaults for %s",
		async (model, locale) => {
			const fetch = vi
				.fn<typeof globalThis.fetch>()
				.mockResolvedValue(emptyResponse());
			const gnani = createGnani({
				apiKey: "test-key",
				baseURL: "https://example.test/proxy/",
				headers: { "X-Trace": "default" },
				fetch,
			});
			const { text, segments, durationInSeconds, language } = await transcribe({
				model: gnani.transcription(model),
				audio,
				headers: { "x-trace": "request" },
				maxRetries: 0,
			});
			const request = new Request(...fetch.mock.calls[0]);
			expect([request.method, request.url]).toEqual([
				"POST",
				"https://example.test/proxy/stt/v3",
			]);
			expect(request.headers.get("x-api-key-id")).toBe("test-key");
			expect(request.headers.get("x-trace")).toBe("request");
			const fields = await request.formData();
			expect(fields.get("model")).toBe(model);
			expect(fields.get("language_code")).toBe(locale);
			const file = fields.get("audio_file") as File;
			expect([file.name, file.type]).toEqual(["audio.ogg", "audio/ogg"]);
			expect(new Uint8Array(await file.arrayBuffer())).toEqual(audio);
			expect([text, segments, durationInSeconds, language]).toEqual([
				"",
				[],
				undefined,
				undefined,
			]);
		},
	);
	it("encodes v3 context, preserves response metadata and reports missing timing support", async () => {
		const body = {
			success: true,
			transcript: "नमस्ते",
			model: "prisma-v3.0",
			detected_language_code: "hi-IN",
			request_id: "req-1",
			processing_time: 0.7,
			truncated: true,
		};
		const fetch = vi
			.fn<typeof globalThis.fetch>()
			.mockResolvedValue(Response.json(body));
		const model = createGnani({ apiKey: "key", fetch }).transcription(
			"prisma-v3.0",
		);
		const signal = new AbortController().signal;
		const result = await model.doGenerate({
			audio: "AQID",
			mediaType: "audio/mp4",
			timestampGranularities: ["word"],
			abortSignal: signal,
			providerOptions: {
				gnani: {
					language_code: "hi-IN,en-IN",
					format: "codemix",
					keyterms: ["HDFC Bank"],
					topic: "banking",
					speaker_names: ["अमित"],
				},
			},
		});
		const options = fetch.mock.calls[0][1];
		expect(options?.signal).toBe(signal);
		const fields = options?.body as FormData;
		expect(fields.get("language_code")).toBe("hi-IN,en-IN");
		expect(fields.get("keyterms")).toBe('["HDFC Bank"]');
		expect(fields.get("speaker_names")).toBe('["अमित"]');
		const file = fields.get("audio_file") as File;
		expect(file.name).toBe("audio.m4a");
		expect(new Uint8Array(await file.arrayBuffer())).toEqual(
			new Uint8Array([1, 2, 3]),
		);
		expect(result).toMatchObject({
			text: "नमस्ते",
			language: "hi",
			durationInSeconds: undefined,
			response: { body },
			providerMetadata: {
				gnani: {
					requestId: "req-1",
					detectedLanguageCode: "hi-IN",
					truncated: true,
				},
			},
		});
		expect(result.warnings.map((w) => w.type)).toEqual([
			"unsupported",
			"other",
		]);
	});
	it("serializes v2.5 ITN, word boosting and substitutions", async () => {
		const fetch = vi
			.fn<typeof globalThis.fetch>()
			.mockResolvedValue(emptyResponse());
		await transcribe({
			model: createGnani({ apiKey: "key", fetch }).transcription("prisma-v2.5"),
			audio,
			providerOptions: {
				gnani: {
					language_code: "hi-IN",
					format: "transcribe",
					itn_native_numerals: true,
					bias_list: ["खाता"],
					bias_score: 1.5,
					enable_substitution: true,
					substitution_map: [{ patterns: ["ok"], replacement: "okay" }],
				},
			},
		});
		const fields = fetch.mock.calls[0][1]?.body as FormData;
		expect(fields.get("bias_list")).toBe('["खाता"]');
		expect(fields.get("bias_score")).toBe("1.5");
		expect(fields.get("substitution_map")).toBe(
			'[{"patterns":["ok"],"replacement":"okay"}]',
		);
		expect(fields.get("itn_native_numerals")).toBe("true");
	});
	it("catches unsupported inputs before uploading", async () => {
		const fetch = vi.fn<typeof globalThis.fetch>();
		const model = createGnani({ apiKey: "key", fetch }).transcription(
			"prisma-v2.5",
		);
		await expect(
			model.doGenerate({ audio, mediaType: "audio/webm" }),
		).rejects.toBeInstanceOf(UnsupportedFunctionalityError);
		await expect(
			model.doGenerate({
				audio,
				mediaType: "audio/wav",
				providerOptions: { gnani: { format: "transliterate" } },
			}),
		).rejects.toBeInstanceOf(InvalidArgumentError);
		expect(fetch).not.toHaveBeenCalled();
	});
	it.each([
		[
			400,
			{
				success: false,
				error: { type: "INVALID_CONTEXT", message: "bad context" },
			},
			"bad context",
			false,
		],
		[422, { detail: [{ msg: "missing file" }] }, "missing file", false],
		[
			429,
			{ detail: { error_code: "RATE_LIMITED", message: "busy" } },
			"busy",
			true,
		],
		[
			504,
			{ error: "Gateway Timeout", message: "upstream timed out" },
			"upstream timed out",
			true,
		],
	] as const)(
		"exposes Gnani HTTP %i using SDK error semantics",
		async (status, body, message, isRetryable) => {
			const gnani = createGnani({
				apiKey: "key",
				fetch: async () => Response.json(body, { status }),
			});
			await expect(
				transcribe({
					model: gnani.transcription("prisma-v3.0"),
					audio,
					maxRetries: 0,
				}),
			).rejects.toMatchObject({
				name: "AI_APICallError",
				statusCode: status,
				message,
				isRetryable,
			});
		},
	);
	it("rejects a successful HTTP response with an invalid transcript shape", async () => {
		const gnani = createGnani({
			apiKey: "key",
			fetch: async () =>
				Response.json({ success: true, transcript: { text: "wrong" } }),
		});
		await expect(
			transcribe({
				model: gnani.transcription("prisma-v3.0"),
				audio,
				maxRetries: 0,
			}),
		).rejects.toMatchObject({ name: "AI_APICallError", statusCode: 200 });
	});
});
