// Run as a standalone file in a clean consumer of the packed npm release.
import assert from "node:assert/strict";
import { Gnani, generateSpeech, transcribe } from "gnani-ai";

const speechBytes = Uint8Array.of(0xff, 0xfb, 0x90, 0, 1, 2, 3, 4);
let requests = 0;
const gnani = new Gnani({
	apiKey: "consumer-test",
	async fetch(url, init) {
		const request = new Request(url, init);
		assert.equal(request.headers.get("X-API-Key-ID"), "consumer-test");
		requests++;
		if (new URL(request.url).pathname === "/api/v1/tts/inference") {
			const body = await request.json();
			assert.equal(body.model, "timbre-v3.0");
			assert.equal(body.audio_config.container, "mp3");
			return new Response(speechBytes, {
				headers: { "content-type": "audio/mpeg" },
			});
		}
		assert.equal(new URL(request.url).pathname, "/stt/v3");
		const form = await request.formData();
		assert.equal(form.get("model"), "prisma-v3.0");
		const file = form.get("audio_file");
		assert.equal(file.name, "audio.mp3");
		assert.deepEqual(new Uint8Array(await file.arrayBuffer()), speechBytes);
		return Response.json({ success: true, transcript: "Hello" });
	},
});
const { audio } = await generateSpeech({
	model: gnani.speech("timbre-v3.0"),
	text: "Hello",
	outputFormat: "mp3",
});
const { text } = await transcribe({
	model: gnani.transcription("prisma-v3.0"),
	audio: audio.uint8Array,
});
assert.equal(text, "Hello");
assert.equal(requests, 2);
console.log("Consumer passed transcription and speech generation.");
