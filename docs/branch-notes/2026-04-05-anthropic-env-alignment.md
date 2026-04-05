# Branch Notes - Anthropic Env Variable Alignment

## What Was Built
- Updated `.env.example` to use Anthropic-oriented variable names (`ANTHROPIC_BASE_URL`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`) and set the model default to `opusplan`.
- Updated backend environment schema and server bootstrap wiring so `LlmClient` now reads the Anthropic variable names.
- Updated README configuration docs to match the new variable names and fallback behavior.
- Added changelog entry documenting the intent of this configuration alignment.

## What Did Not Work
- Keeping the previous `LLM_*` names caused mismatch with Claude Code config and required manual translation by operators.
- This was corrected by renaming the variables at all usage points.

## Follow-up Recommendations
- Consider temporary backward-compatible aliases for `LLM_*` names if external automation still depends on legacy keys.
