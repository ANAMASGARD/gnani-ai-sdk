import {
	NoSuchModelError,
	type SharedV4Warning,
	type TranscriptionModelV4,
	UnsupportedFunctionalityError,
} from "@ai-sdk/provider";
import {
	convertBase64ToUint8Array,
	createJsonResponseHandler,
	mediaTypeToExtension,
	parseProviderOptions,
	postFormDataToApi,
} from "@ai-sdk/provider-utils";
import { z } from "zod/v4";
import {
	failedResponseHandler,
	GNANI_PROVIDER_ID,
	type GnaniConfig,
} from "../config.js";

export type GnaniTranscriptionModelId = "prisma-v2.5" | "prisma-v3.0";

const locale = z.enum([
	"bn-IN",
	"en-IN",
	"gu-IN",
	"hi-IN",
	"kn-IN",
	"ml-IN",
	"mr-IN",
	"pa-IN",
	"ta-IN",
	"te-IN",
]);
const common = {
	enable_substitution: z.boolean().optional(),
	substitution_map: z
		.array(
			z.object({
				patterns: z.array(z.string().min(1).max(200)).min(1),
				replacement: z.string(),
			}),
		)
		.max(10)
		.optional(),
};
const prisma25 = z.strictObject({
	...common,
	language_code: locale.optional(),
	format: z.enum(["verbatim", "transcribe"]).optional(),
	itn_native_numerals: z.boolean().optional(),
	bias_list: z
		.array(z.string().regex(/^\p{L}[\p{L}\p{M}]*$/u))
		.max(100)
		.optional(),
	bias_score: z.literal([0, 0.5, 1, 1.5, 2]).optional(),
});
const prisma30 = z.strictObject({
	...common,
	language_code: z
		.string()
		.refine((value) => {
			if (value === "indic-auto") return true;
			const languages = value.split(",");
			return (
				languages.length <= 4 &&
				new Set(languages).size === languages.length &&
				languages.every((language) => locale.safeParse(language).success)
			);
		}, "Expected indic-auto or one to four distinct, comma-separated Gnani locales.")
		.optional(),
	format: z
		.enum(["verbatim", "transcribe", "codemix", "transliterate"])
		.optional(),
	keyterms: z.array(z.string().min(1)).max(200).optional(),
	topic: z.string().min(1).max(1600).optional(),
	previous_text: z.string().min(1).optional(),
	speaker_names: z.array(z.string().min(1)).min(1).max(4).optional(),
});

export type GnaniTranscriptionOptions =
	| z.infer<typeof prisma25>
	| z.infer<typeof prisma30>;

const transcriptResponse = createJsonResponseHandler(
	z.object({
		success: z.literal(true),
		transcript: z.string(),
		model: z.string().optional(),
		detected_language_code: z.string().optional(),
		request_id: z.string().optional(),
		truncated: z.boolean().optional(),
	}),
);

const extensionAliases: Record<string, string> = {
	"x-flac": "flac",
	wave: "wav",
	"vnd.wave": "wav",
};

function audioFilename(mediaType: string) {
	const mime = mediaType.split(";")[0].trim().toLowerCase();
	const subtype = mediaTypeToExtension(mime);
	const extension = extensionAliases[subtype] ?? subtype;
	if (
		!mime.startsWith("audio/") ||
		!["wav", "mp3", "ogg", "flac", "aac", "m4a"].includes(extension)
	) {
		throw new UnsupportedFunctionalityError({
			functionality: `Prisma transcription of ${mediaType}`,
		});
	}
	return `audio.${extension}`;
}

export function createTranscriptionModel(
	modelId: GnaniTranscriptionModelId,
	config: GnaniConfig,
): TranscriptionModelV4 {
	if (modelId !== "prisma-v2.5" && modelId !== "prisma-v3.0") {
		throw new NoSuchModelError({ modelId, modelType: "transcriptionModel" });
	}
	const isV3 = modelId === "prisma-v3.0";
	return {
		specificationVersion: "v4",
		provider: "gnani.transcription",
		modelId,
		async doGenerate({
			audio,
			mediaType,
			providerOptions,
			headers,
			abortSignal,
			timestampGranularities,
		}) {
			const options = await parseProviderOptions<GnaniTranscriptionOptions>({
				provider: GNANI_PROVIDER_ID,
				providerOptions,
				schema: isV3 ? prisma30 : prisma25,
			});
			const filename = audioFilename(mediaType);
			const data =
				typeof audio === "string"
					? convertBase64ToUint8Array(audio)
					: new Uint8Array(audio);
			const formData = new FormData();
			formData.set(
				"audio_file",
				new Blob([data], { type: mediaType }),
				filename,
			);
			formData.set("model", modelId);
			formData.set("language_code", isV3 ? "indic-auto" : "en-IN");
			for (const [key, value] of Object.entries(options ?? {})) {
				if (value !== undefined)
					formData.set(
						key,
						typeof value === "string" ? value : JSON.stringify(value),
					);
			}

			const timestamp = new Date();
			const { value, rawValue, responseHeaders } = await postFormDataToApi({
				url: `${config.baseURL}/stt/v3`,
				headers: config.headers(headers),
				formData,
				successfulResponseHandler: transcriptResponse,
				failedResponseHandler,
				abortSignal,
				fetch: config.fetch,
			});
			const warnings: SharedV4Warning[] = [];
			if (timestampGranularities?.length)
				warnings.push({
					type: "unsupported",
					feature: "timestampGranularities",
					details: "Prisma REST returns an untimed transcript.",
				});
			if (value.truncated)
				warnings.push({
					type: "other",
					message:
						"Prisma truncated the transcript. Retry with a shorter clip.",
				});
			return {
				text: value.transcript,
				segments: [],
				language: value.detected_language_code?.split("-")[0],
				durationInSeconds: undefined,
				warnings,
				response: {
					timestamp,
					modelId: value.model ?? modelId,
					headers: responseHeaders,
					body: rawValue,
				},
				providerMetadata: {
					gnani: {
						requestId: value.request_id,
						detectedLanguageCode: value.detected_language_code,
						truncated: value.truncated,
					},
				},
			};
		},
	};
}
