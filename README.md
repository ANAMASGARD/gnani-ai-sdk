# Gnani AI SDK for TypeScript

`gnani` is an unofficial, community-maintained provider for the Vercel AI SDK. Use your own Gnani AI key to transcribe recordings with Prisma or synthesize speech with Timbre.

## Install

Install the provider with your package manager.

| Package manager | Command              |
| --------------- | -------------------- |
| npm             | `npm i gnani`        |
| pnpm            | `pnpm add gnani`     |
| Yarn            | `yarn add gnani`     |
| Bun             | `bun add gnani`      |
| Deno            | `deno add npm:gnani` |

The package includes AI SDK 7 and re-exports its `transcribe` and `generateSpeech` functions. Existing AI SDK 7 applications can also import those functions directly from `ai`. The package ships ESM, CommonJS and TypeScript declarations. Node.js 22.12 or later supports both entry points.

## Transcribe and generate speech

Set `GNANI_API_KEY` in your server environment. You can create a key in the [Gnani dashboard](https://app.gnani.ai).

```ts
import { readFile, writeFile } from "node:fs/promises";
import { Gnani, generateSpeech, transcribe } from "gnani";

const gnani = new Gnani({ apiKey: process.env.GNANI_API_KEY });

const transcript = await transcribe({
	model: gnani.transcription("prisma-v3.0"),
	audio: await readFile("recording.wav"),
});
console.log(transcript.text);

const { audio } = await generateSpeech({
	model: gnani.speech("timbre-v3.0"),
	text: "नमस्ते, आप कैसे हैं?",
	language: "hi",
	voice: "Shivani",
	outputFormat: "wav",
});
await writeFile("greeting.wav", audio.uint8Array);
```

`createGnani(settings)` accepts the same settings as the constructor. The preconfigured `gnani` export reads `GNANI_API_KEY` at request time. Settings also accept `baseURL`, `headers` and a custom `fetch`. AI SDK provider registries can use `transcriptionModel()` and `speechModel()`.

On Deno, a live in-memory round trip uses `--allow-net=api.vachana.ai --allow-env=GNANI_API_KEY --allow-sys=hostname`. The hostname permission is used by an AI SDK dependency. Add file permissions for examples that read or write recordings.

## Models

| Model ID      | AI SDK function  | Provider defaults                            |
| ------------- | ---------------- | -------------------------------------------- |
| `prisma-v2.5` | `transcribe`     | One input language, `en-IN`                  |
| `prisma-v3.0` | `transcribe`     | Automatic language detection, `indic-auto`   |
| `timbre-v2.5` | `generateSpeech` | `Nalini`, automatic language selection, WAV  |
| `timbre-v3.0` | `generateSpeech` | `Shivani`, automatic language selection, WAV |

### Prisma options

REST transcription accepts WAV, MP3, OGG, FLAC, AAC and M4A recordings up to 30 seconds. Pass Gnani’s REST field names in `providerOptions.gnani`. For v3.0, `language_code` accepts `indic-auto` or up to four comma-separated locales. [Prisma REST reference](https://docs.gnani.ai/api/STT/speech-to-text) · [Supported languages](https://docs.gnani.ai/api/STT/languages)

```ts
import type { GnaniTranscriptionOptions } from "gnani";

const options = {
	language_code: "hi-IN,en-IN",
	format: "codemix",
	keyterms: ["HDFC Bank"],
} satisfies GnaniTranscriptionOptions;

const result = await transcribe({
	model: gnani.transcription("prisma-v3.0"),
	audio: await readFile("recording.wav"),
	providerOptions: { gnani: options },
});
```

Prisma v2.5 supports `format`, `itn_native_numerals`, `bias_list` and `bias_score`. Prisma v3.0 supports `format`, `keyterms`, `topic`, `previous_text` and `speaker_names`. Both accept `enable_substitution` and `substitution_map`. REST returns untimed text. When Gnani reports a detected locale, `result.language` contains the ISO language code and `result.providerMetadata.gnani.detectedLanguageCode` contains the full locale.

### Timbre options

Pass `voice`, `language`, `speed` and `outputFormat` directly to `generateSpeech`. Select a voice from the chosen model’s catalog. Supported output formats are `wav`, `mp3`, `ogg` or `opus` (Ogg Opus), `pcm` (raw PCM), `mulaw` and `alaw`. Use `providerOptions.gnani.audio_config` for `sample_rate`, `num_channels`, `sample_width` and MP3 `bitrate`. Timbre v3.0 also accepts expressive tags inside `text`. [Voice catalog](https://docs.gnani.ai/api/TTS/available-voices) · [Timbre REST reference](https://docs.gnani.ai/api/TTS/tts-inference)

## Development

Use Node.js 22.18 or later on the 22.x line, or Node.js 24.11 or later on the 24.x line, to run the build tools.

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

With a Gnani API key, run `node examples/roundtrip.mjs` for a live speech round trip. The full opt-in voice and language suite writes WAV files and a JSONL report to a directory you choose. Its 856 cases use your Gnani account. It tests all 76 voices across ten languages plus Hinglish and compares both Prisma models’ transcripts against known phrases in all ten transcription languages.

```sh
npm run test:live -- /tmp/gnani-verification
```

Using the same directory resumes the run. Add `--retry-failed` to repeat failed cases. The automated audio checks measure file validity, duration and signal level. Listening is needed to judge pronunciation and voice quality.

## License

MIT. [License text](LICENSE)
