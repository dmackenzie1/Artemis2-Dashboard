# 2026-04-09 — Pipeline service strategy extraction

## Summary
- Extracted transcript day-group/chunking/context-submission logic from `pipelineService.ts` into `TranscriptContextBuilder`.
- Extracted summary-specific generation behavior into strategy classes:
  - `DailySummaryGenerator`
  - `NotableMomentsGenerator`
- Reduced `PipelineService` to orchestration responsibilities by delegating context and generation internals to the new modules.
- Added targeted Vitest coverage for the new extracted modules.

## What Did Not Work
- Initial attempt used class field initializers in `PipelineService` that referenced constructor-injected dependencies (`this.config`, `this.getEntityManager`) before safe initialization ordering; this was corrected by instantiating strategy dependencies in the constructor body.

## Validation
- Ran backend TypeScript lint (`tsc --noEmit`) and backend Vitest suites to validate extraction behavior.
