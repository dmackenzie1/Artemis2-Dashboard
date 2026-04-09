# 2026-04-09 - RAG chat token-array parameter fix

## Summary
- Fixed transcript candidate SQL parameterization in `transcriptCandidateService` by wrapping token bindings in explicit `array[?]::text[]` casts so MikroORM/Knex array expansion produces valid Postgres array syntax.
- Updated overlap and ranking predicates (`&&` and `any(...)`) to consume the explicit array expressions while preserving existing channel filtering and candidate limit behavior.

## What Did Not Work
- Keeping anonymous `?` placeholders with array casts (`?::text[]`) caused MikroORM parameter interpolation to emit an invalid SQL fragment for token arrays (e.g., `'a', 'b'::text[]`), which fails at parse time near the first comma.
- Switching to numbered `$1...$n` placeholders was considered, but without consistent evidence that the current driver path forwards positional bindings unchanged through `execute(...)`, this path was less reliable than explicit `array[?]` wrapping for the existing Knex-style binding semantics.

## Validation
- `npm run lint`
- `npm run test`
