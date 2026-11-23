![Gnani AI — The Frontier AI Company](https://raw.githubusercontent.com/ANAMASGARD/gnani-ai-sdk/main/assets/gnani-ai-banner.png)

# Gnani AI provider for the Vercel AI SDK

Use `transcribe()` with **Gnani Prisma** to turn recordings into text, and `generateSpeech()` with **Gnani Timbre** to turn text into audio. Both model families support English and nine Indian languages. [Speech-to-text docs](https://docs.gnani.ai/api/STT/overview) · [Text-to-speech docs](https://docs.gnani.ai/api/TTS/tts-inference)

## Install

```sh
npm i gnani-ai
```

| Package manager | Command                 |
| --------------- | ----------------------- |
| pnpm            | `pnpm add gnani-ai`     |
| Yarn            | `yarn add gnani-ai`     |
| Bun             | `bun add gnani-ai`      |
| Deno            | `deno add npm:gnani-ai` |

The package includes AI SDK 7. Import the speech functions directly from `gnani-ai`, or import them from `ai` in an existing AI SDK 7 project. Node.js 22.12 or later supports both the ESM and CommonJS entry points, each with TypeScript declarations.

Set `GNANI_API_KEY` in your server environment. The examples below use the preconfigured `gnani` provider, which reads that key when making a request. [Get a Gnani API key](https://app.gnani.ai)

## Transcribe and generate speech

### Speech-to-text with Prisma

Pass a recording of up to 30 seconds to `transcribe()`. Prisma v3.0 can detect the spoken language and transcribe speech that switches between languages. Use Prisma v2.5 when you know the language and want to supply its locale. [Prisma REST guide](https://docs.gnani.ai/api/STT/speech-to-text) · [Compare Prisma models](https://docs.gnani.ai/api/STT/models/overview)

```ts
import { readFile } from "node:fs/promises";
import { gnani, transcribe } from "gnani-ai";

const { text } = await transcribe({
	model: gnani.transcription("prisma-v3.0"),
	audio: await readFile("recording.wav"),
});
console.log(text);
```

For live microphone audio or long recordings, Gnani provides separate realtime and batch APIs that you can call directly. [Realtime transcription](https://docs.gnani.ai/api/STT/stt-websocket) · [Batch transcription](https://docs.gnani.ai/api/STTBatch/Introduction)

### Text-to-speech with Timbre

Pass text and a voice to `generateSpeech()` to receive a complete audio file. This example saves a Hindi greeting using Shivani, a Timbre v3.0 voice. Each model has its own voice catalog. [Timbre voices](https://docs.gnani.ai/api/TTS/available-voices)

```ts
import { writeFile } from "node:fs/promises";
import { generateSpeech, gnani } from "gnani-ai";

const { audio } = await generateSpeech({
	model: gnani.speech("timbre-v3.0"),
	text: "नमस्ते, आप कैसे हैं?",
	language: "hi-IN",
	voice: "Shivani",
	outputFormat: "wav",
});
await writeFile("greeting.wav", audio.uint8Array);
```

## Models

| Model ID      | Choose it for                                                                        | Provider defaults                          |
| ------------- | ------------------------------------------------------------------------------------ | ------------------------------------------ |
| `prisma-v3.0` | Language detection, mixed-language speech and hints such as names or technical terms | `indic-auto`                               |
| `prisma-v2.5` | Single-language recordings, word boosting and number formatting                      | `en-IN`                                    |
| `timbre-v3.0` | Voices such as Shivani and Avinash, with inline cues for pauses or whispers          | Shivani, automatic language selection, WAV |
| `timbre-v2.5` | Voices such as Nalini and Kaveri, with adjustable speaking speed                     | Nalini, automatic language selection, WAV  |

Both families support Bengali, English, Gujarati, Hindi, Kannada, Malayalam, Marathi, Punjabi, Tamil and Telugu. Timbre also accepts `hi-en` for Hinglish. [Transcription languages](https://docs.gnani.ai/api/STT/languages) · [Speech synthesis languages](https://docs.gnani.ai/api/TTS/tts-inference)

### Prisma options

Prisma accepts WAV, MP3, OGG, FLAC, AAC and M4A. Pass Gnani’s REST fields under `providerOptions.gnani`. For example, if a recording mixes Hindi and English, you can narrow detection to those two languages, keep the mixed-language wording with `codemix`, and give Prisma a term to listen for. Prisma v3.0 accepts up to four comma-separated locales or `indic-auto`. [Prisma v3.0 options](https://docs.gnani.ai/api/STT/models/prisma-v3) · [Recording limits](https://docs.gnani.ai/api/STT/limits)

```ts
import { readFile } from "node:fs/promises";
import { gnani, transcribe, type GnaniTranscriptionOptions } from "gnani-ai";

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

Pass `voice`, `language`, `speed` and `outputFormat` directly to `generateSpeech()`. Choose `wav`, `mp3`, `ogg` or `opus` (Ogg Opus), `pcm` (raw PCM), `mulaw` or `alaw`. Use `providerOptions.gnani.audio_config` for `sample_rate`, `num_channels`, `sample_width` and MP3 `bitrate`. With Timbre v3.0 you can add delivery cues such as `<whispers>` inside the text. [Timbre REST reference](https://docs.gnani.ai/api/TTS/tts-inference) · [Audio tags](https://docs.gnani.ai/api/TTS/tts-audio-tags)

## Provider configuration

Use `new Gnani({ apiKey })` or `createGnani({ apiKey })` to pass a key explicitly. Both also accept `baseURL`, `headers` and a custom `fetch`. AI SDK provider registries can use `transcriptionModel()` and `speechModel()`.

On Deno, a live in-memory round trip uses `--allow-net=api.vachana.ai --allow-env=GNANI_API_KEY --allow-sys=hostname`. An AI SDK dependency reads the hostname. Add file permissions for examples that read or write recordings.

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

MIT. [License text](https://github.com/ANAMASGARD/gnani-ai-sdk/blob/main/LICENSE)
