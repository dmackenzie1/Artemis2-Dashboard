# 2026-04-06 — Signal Chat HTML formatting

## Summary
- Updated `SignalChatPage` answer rendering to use the shared `renderStructuredText` helper so list/heading/paragraph response structure is emitted as HTML elements instead of showing markdown-like raw text.
- Reused existing shared formatted-copy/list classes for consistent typography with Daily/Timeline/Overview summary blocks.

## What Did Not Work
- Keeping the plain `<p>{chatResponse.answer}</p>` rendering did not satisfy the requirement because markdown-like response structure remained unformatted in the chat answer pane.
