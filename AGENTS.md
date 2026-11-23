# Working on gnani-ai

This repository builds one TypeScript community provider for AI SDK 7. The published entry point is `gnani-ai`. Both `new Gnani(settings)` and `createGnani(settings)` use the same adapters.

- Keep changes scoped to the requested models and use the installed `@ai-sdk/provider` V4 specifications. The version-matched specifications are in `node_modules/@ai-sdk/provider/src` and AI SDK examples are in `node_modules/ai/docs`.
- Keep provider code in `src` portable with Fetch, FormData, Blob, Uint8Array and AbortSignal. Use `src/stt` for Prisma, `src/tts` for Timbre and the shared configuration for authentication and errors.
- Use npm and the checked-in package lock for development. Run `npm run typecheck`, `npm run lint`, `npm test` and `npm run build`. Verify packaging changes against the tarball in npm, pnpm, Yarn, Bun and Deno using `scripts/check-install.sh`.
- Run paid live verification explicitly with a server-side `GNANI_API_KEY`. See the README for coverage and resuming. Keep credentials and generated audio outside version control. Update the test catalog against the linked Gnani voice catalog when voices change.
- When the user types `/graphify`, invoke the Graphify skill first. When interacting with Cloudflare, use the cf CLI unless the project has a Wrangler configuration file.
