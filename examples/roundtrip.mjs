import { Gnani, generateSpeech, transcribe } from "gnani-ai";

const gnani = new Gnani();
const { audio } = await generateSpeech({
	model: gnani.speech("timbre-v3.0"),
	text: "आज मौसम अच्छा है।",
	voice: "Shivani",
	language: "hi",
	outputFormat: "wav",
});
const { text } = await transcribe({
	model: gnani.transcription("prisma-v3.0"),
	audio: audio.uint8Array,
});
console.log(text);
