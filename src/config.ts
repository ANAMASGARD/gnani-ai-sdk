import {
	createJsonErrorResponseHandler,
	type FetchFunction,
	loadApiKey,
	normalizeHeaders,
} from "@ai-sdk/provider-utils";
import { z } from "zod/v4";

export const GNANI_PROVIDER_ID = "gnani";

export interface GnaniProviderSettings {
	/** Defaults to the GNANI_API_KEY environment variable. */
	apiKey?: string;
	/** Defaults to https://api.vachana.ai. */
	baseURL?: string;
	headers?: Record<string, string>;
	fetch?: FetchFunction;
}

export function createConfig(settings: GnaniProviderSettings) {
	return {
		baseURL: (settings.baseURL ?? "https://api.vachana.ai").replace(/\/+$/, ""),
		fetch: settings.fetch,
		headers: (callHeaders?: Record<string, string | undefined>) => ({
			"x-api-key-id": loadApiKey({
				apiKey: settings.apiKey,
				environmentVariableName: "GNANI_API_KEY",
				description: "Gnani",
			}),
			...normalizeHeaders(settings.headers),
			...normalizeHeaders(callHeaders),
		}),
	};
}

export type GnaniConfig = ReturnType<typeof createConfig>;

const messageObject = z.looseObject({ message: z.string() });

// Auth, Prisma, Timbre and request validation each use a different error envelope.
export const failedResponseHandler = createJsonErrorResponseHandler({
	errorSchema: z.looseObject({
		message: z.string().optional(),
		error: z.union([messageObject, z.string()]).optional(),
		detail: z
			.union([
				messageObject,
				z.string(),
				z.array(z.looseObject({ msg: z.string() })),
			])
			.optional(),
	}),
	errorToMessage: ({ message, error, detail }) => {
		if (message) return message;
		if (error) return typeof error === "string" ? error : error.message;
		if (typeof detail === "string") return detail;
		if (Array.isArray(detail)) return detail.map((item) => item.msg).join(", ");
		return detail?.message ?? "Gnani API request failed.";
	},
});
