import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { generateSpeech, gnani, transcribe } from "gnani";
import catalog from "./live-catalog.json" with { type: "json" };

const directory = process.argv[2];
if (!directory || !process.env.GNANI_API_KEY) {
	throw new Error(
		"Set GNANI_API_KEY and pass an output directory for the live verification.",
	);
}
mkdirSync(directory, { recursive: true });
const logFile = join(directory, "results.jsonl");
const previous = existsSync(logFile)
	? readFileSync(logFile, "utf8").trim()
	: "";
const results = new Map(
	(previous ? previous.split("\n") : []).map((line) => {
		const row = JSON.parse(line);
		return [row.id, row];
	}),
);
const retryFailed = process.argv.includes("--retry-failed");

async function check(id, run) {
	const prior = results.get(id);
	if (prior && (prior.ok || !retryFailed)) return prior;
	let result;
	try {
		result = { id, ok: true, ...(await run()) };
	} catch (error) {
		const cause = error.lastError ?? error;
		result = { id, ok: false, status: cause.statusCode, error: cause.message };
	}
	results.set(id, result);
	appendFileSync(logFile, `${JSON.stringify(result)}\n`);
	if (!result.ok || results.size % 25 === 0)
		console.log(results.size, id, result.ok ? "ok" : result.error);
	if ([401, 402, 403, 429].includes(result.status))
		throw new Error(`Live run paused at ${id} (HTTP ${result.status}).`);
	return result;
}

// Read RIFF chunks so metadata/padding before the sample data is supported.
function inspectWav(bytes) {
	const wav = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (
		wav.toString("ascii", 0, 4) !== "RIFF" ||
		wav.toString("ascii", 8, 12) !== "WAVE"
	) {
		throw new Error("Expected a WAV container.");
	}
	let sampleRate;
	let samples;
	for (let offset = 12; offset + 8 <= wav.length; ) {
		const tag = wav.toString("ascii", offset, offset + 4);
		const size = wav.readUInt32LE(offset + 4);
		const start = offset + 8;
		if (start + size > wav.length) throw new Error("Incomplete WAV chunk.");
		if (tag === "fmt ") {
			if (
				wav.readUInt16LE(start) !== 1 ||
				wav.readUInt16LE(start + 2) !== 1 ||
				wav.readUInt16LE(start + 14) !== 16
			) {
				throw new Error("Expected mono 16-bit PCM.");
			}
			sampleRate = wav.readUInt32LE(start + 4);
		}
		if (tag === "data") samples = wav.subarray(start, start + size);
		offset = start + size + (size % 2);
	}
	if (
		sampleRate !== 16000 ||
		!samples ||
		samples.length < 3200 ||
		samples.length % 2
	)
		throw new Error("Missing or invalid 16 kHz sample data.");
	let sumSquares = 0;
	for (let i = 0; i < samples.length; i += 2)
		sumSquares += samples.readInt16LE(i) ** 2;
	const rms = Math.sqrt(sumSquares / (samples.length / 2));
	if (rms < 10) throw new Error("The audio is silent or nearly silent.");
	return {
		bytes: wav.length,
		seconds: samples.length / (2 * sampleRate),
		rms: Math.round(rms),
	};
}

function synthesize(model, voice, language) {
	const id = [model, voice, language].join("_");
	return check(id, async () => {
		const { audio } = await generateSpeech({
			model: gnani.speech(model),
			voice,
			language,
			text: catalog.phrases[language],
			outputFormat: "wav",
			providerOptions: { gnani: { audio_config: { sample_rate: 16000 } } },
			maxRetries: 2,
			abortSignal: AbortSignal.timeout(60000),
		});
		const info = inspectWav(audio.uint8Array);
		const file = `${id}.wav`;
		writeFileSync(join(directory, file), audio.uint8Array);
		return { file, ...info };
	});
}

const preferred = catalog["timbre-v2.5"];
// Use one known spoken phrase per language as the same input to both recognizers.
for (const [language, voices] of Object.entries(preferred)) {
	const clip = await synthesize("timbre-v2.5", voices[0], language);
	if (language === "hi-en" || !clip.ok) continue;
	for (const model of ["prisma-v2.5", "prisma-v3.0"]) {
		await check(`${model}_${language}`, async () => {
			const { text, providerMetadata } = await transcribe({
				model: gnani.transcription(model),
				audio: readFileSync(join(directory, clip.file)),
				providerOptions: { gnani: { language_code: language } },
				maxRetries: 1,
				abortSignal: AbortSignal.timeout(45000),
			});
			const normalize = (phrase) =>
				phrase
					.normalize("NFC")
					.toLowerCase()
					.replace(/[\p{P}\s]/gu, "");
			if (normalize(text) !== normalize(catalog.phrases[language])) {
				throw new Error(
					`Expected "${catalog.phrases[language]}", heard "${text}".`,
				);
			}
			return {
				expected: catalog.phrases[language],
				text,
				language: providerMetadata.gnani.detectedLanguageCode,
			};
		});
	}
}

// Exercise every catalog voice early, including the older model's preferred locale.
for (const [language, voices] of Object.entries(preferred)) {
	for (const voice of voices) await synthesize("timbre-v2.5", voice, language);
}
for (const voice of catalog["timbre-v3.0"])
	await synthesize("timbre-v3.0", voice, "hi-IN");
for (const language of Object.keys(catalog.phrases)) {
	for (const voice of Object.values(preferred).flat())
		await synthesize("timbre-v2.5", voice, language);
	for (const voice of catalog["timbre-v3.0"])
		await synthesize("timbre-v3.0", voice, language);
}
const successes = [...results.values()].filter((row) => row.ok).length;
console.log(
	`${successes} of ${results.size} checks passed. Evidence: ${logFile}`,
);
if (successes !== results.size) process.exitCode = 1;
