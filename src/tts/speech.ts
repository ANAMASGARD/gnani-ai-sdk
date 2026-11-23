import {
	APICallError,
	NoSuchModelError,
	type SpeechModelV4,
	UnsupportedFunctionalityError,
} from "@ai-sdk/provider";
import {
	createBinaryResponseHandler,
	parseProviderOptions,
	postJsonToApi,
	type ResponseHandler,
} from "@ai-sdk/provider-utils";
import { z } from "zod/v4";
import {
	failedResponseHandler,
	GNANI_PROVIDER_ID,
	type GnaniConfig,
} from "../config.js";
import { finalizeWav } from "./wav.js";

export type GnaniSpeechModelId = "timbre-v2.5" | "timbre-v3.0";

const speechOptions = z.strictObject({
	audio_config: z
		.strictObject({
			sample_rate: z
				.literal([8000, 16000, 22050, 24000, 44100, 48000])
				.optional(),
			num_channels: z.number().int().min(1).max(8).optional(),
			sample_width: z.number().int().min(1).max(4).optional(),
			bitrate: z.enum(["32k", "64k", "96k", "128k", "192k"]).optional(),
		})
		.optional(),
});

export type GnaniSpeechOptions = z.infer<typeof speechOptions>;

function audioContainer(format: string) {
	switch (format) {
		case "wav":
		case "mp3":
		case "ogg":
		case "mulaw":
		case "alaw":
			return format;
		case "opus":
			return "ogg";
		case "pcm":
			return "raw";
		default:
			throw new UnsupportedFunctionalityError({
				functionality: `Timbre output format "${format}"`,
			});
	}
}

const binaryResponse = createBinaryResponseHandler();
const audioResponse: ResponseHandler<Uint8Array> = async (options) => {
	const { response, url, requestBodyValues } = options;
	const contentType = response.headers
		.get("content-type")
		?.split(";")[0]
		.trim()
		.toLowerCase();
	if (contentType === "application/json")
		throw (await failedResponseHandler(options)).value;
	const result = await binaryResponse(options);
	if (
		result.value.byteLength === 0 ||
		(contentType &&
			!contentType.startsWith("audio/") &&
			contentType !== "application/octet-stream")
	) {
		throw new APICallError({
			message: "Expected a non-empty audio response from Timbre.",
			url,
			requestBodyValues,
			statusCode: response.status,
			responseHeaders: result.responseHeaders,
		});
	}
	return result;
};

export function createSpeechModel(
	modelId: GnaniSpeechModelId,
	config: GnaniConfig,
): SpeechModelV4 {
	if (modelId !== "timbre-v2.5" && modelId !== "timbre-v3.0") {
		throw new NoSuchModelError({ modelId, modelType: "speechModel" });
	}
	return {
		specificationVersion: "v4",
		provider: "gnani.speech",
		modelId,
		async doGenerate({
			text,
			voice,
			language = "auto",
			speed,
			outputFormat = "wav",
			instructions,
			providerOptions,
			abortSignal,
			headers,
		}) {
			const options = await parseProviderOptions({
				provider: GNANI_PROVIDER_ID,
				providerOptions,
				schema: speechOptions,
			});
			const body = {
				model: modelId,
				text,
				voice: voice ?? (modelId === "timbre-v3.0" ? "Shivani" : "Nalini"),
				language: /^[a-z]{2}$/i.test(language)
					? `${language.toLowerCase()}-IN`
					: language,
				speed,
				audio_config: {
					...options?.audio_config,
					container: audioContainer(outputFormat),
				},
			};
			const timestamp = new Date();
			const { value: audio, responseHeaders } = await postJsonToApi({
				url: `${config.baseURL}/api/v1/tts/inference`,
				headers: config.headers(headers),
				body,
				successfulResponseHandler: audioResponse,
				failedResponseHandler,
				abortSignal,
				fetch: config.fetch,
			});
			if (body.audio_config.container === "wav") finalizeWav(audio);
			return {
				audio,
				warnings:
					instructions == null
						? []
						: [
								{
									type: "unsupported",
									feature: "instructions",
									details: "Timbre v3.0 accepts inline audio tags in text.",
								},
							],
				request: { body },
				response: { timestamp, modelId, headers: responseHeaders },
			};
		},
	};
}
