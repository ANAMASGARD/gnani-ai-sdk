import { NoSuchModelError, type ProviderV4 } from "@ai-sdk/provider";
import {
	createConfig,
	type GnaniConfig,
	type GnaniProviderSettings,
} from "./config.js";
import {
	createTranscriptionModel,
	type GnaniTranscriptionModelId,
} from "./stt/transcription.js";
import { createSpeechModel, type GnaniSpeechModelId } from "./tts/speech.js";

export class Gnani implements ProviderV4 {
	readonly specificationVersion = "v4";
	readonly #config: GnaniConfig;

	constructor(settings: GnaniProviderSettings = {}) {
		this.#config = createConfig(settings);
	}

	readonly transcription = (id: GnaniTranscriptionModelId) =>
		createTranscriptionModel(id, this.#config);
	readonly transcriptionModel = this.transcription;
	readonly speech = (id: GnaniSpeechModelId) =>
		createSpeechModel(id, this.#config);
	readonly speechModel = this.speech;

	languageModel(modelId: string): never {
		throw new NoSuchModelError({ modelId, modelType: "languageModel" });
	}
	embeddingModel(modelId: string): never {
		throw new NoSuchModelError({ modelId, modelType: "embeddingModel" });
	}
	imageModel(modelId: string): never {
		throw new NoSuchModelError({ modelId, modelType: "imageModel" });
	}
}

export type GnaniProvider = Gnani;

export function createGnani(settings?: GnaniProviderSettings): Gnani {
	return new Gnani(settings);
}

export const gnani = new Gnani();
