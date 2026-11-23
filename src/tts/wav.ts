// Timbre can return streaming WAV headers even for a completed REST response.
// Fill only unknown sizes so file readers can calculate the actual duration.
export function finalizeWav(audio: Uint8Array) {
	const view = new DataView(audio.buffer, audio.byteOffset, audio.byteLength);
	const tag = (start: number) =>
		String.fromCharCode(...audio.subarray(start, start + 4));
	if (audio.length < 12 || tag(0) !== "RIFF" || tag(8) !== "WAVE") return;
	const unknownSize = 0xffffffff;
	if (view.getUint32(4, true) === unknownSize)
		view.setUint32(4, audio.length - 8, true);
	for (let offset = 12; offset + 8 <= audio.length; ) {
		const size = view.getUint32(offset + 4, true);
		if (tag(offset) === "data" && size === unknownSize) {
			view.setUint32(offset + 4, audio.length - offset - 8, true);
			return;
		}
		offset += 8 + size + (size % 2);
	}
}
