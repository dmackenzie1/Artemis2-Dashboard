# 2026-04-06 — Redis LLM response cache (60-minute TTL, chat excluded)

## Summary
- Added Redis-backed response caching for server-side LLM API calls with a default 60-minute TTL.
- Wired Redis into Docker Compose using a dedicated `redis:8-alpine` service and persistent volume.
- Updated `LlmClient` to hash request payloads and serve identical non-chat prompts from Redis before making upstream API calls.
- Explicitly disabled caching for chat-mode responses (`analysis/chat/*`) so chat remains uncached by design.
- Added unit coverage for cache hit behavior and cache bypass behavior.

## What Did Not Work
- Initial signal-handler insertion landed inside `startPipelineSchedule`, which would have reduced readability and duplicated shutdown handlers. I removed the misplaced block and kept a single shutdown registration near the connectivity polling section.
