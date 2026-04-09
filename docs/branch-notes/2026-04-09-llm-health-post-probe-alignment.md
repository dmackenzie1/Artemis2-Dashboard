# 2026-04-09 – LLM health probe transport alignment

## What changed
- Updated `LlmClient.checkConnectivity` to send a lightweight `POST` connectivity payload instead of an `OPTIONS` probe so health checks exercise the same API method/path used by real model generation calls.
- Reused OpenAI-compatible request formatting (for `/v1/chat/completions`) and preserved existing auth/header behavior to keep probe behavior consistent with runtime prompt traffic.
- Expanded connectivity probe error details to include response body text when non-2xx responses occur, improving operator diagnostics from `/api/health`.
- Updated `llmClient` connectivity tests to assert the new `POST` probe method and request payload.

## Why
- Operators reported `/api/health` showing disconnected status with `405 Method Not Allowed` while mission pages and other model-backed calls were still functioning.
- Some upstream gateways reject `OPTIONS` but allow `POST`, which made the prior probe method inconsistent with production traffic and generated false negative health states.

## What Did Not Work
- Retaining the `OPTIONS`-only probe path did not satisfy the observed environment behavior because the gateway continued returning `405` despite successful normal request flows.
