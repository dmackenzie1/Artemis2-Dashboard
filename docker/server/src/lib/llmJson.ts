import type { z } from "zod";

export type DetectedLlmFormat = "json-object" | "json-array" | "markdown-fenced-json" | "html" | "text" | "empty";

export type JsonBoundaryValidationResult<T> =
  | {
      ok: true;
      data: T;
      detectedFormat: DetectedLlmFormat;
      normalizedJsonText: string;
    }
  | {
      ok: false;
      detectedFormat: DetectedLlmFormat;
      normalizedJsonText: string | null;
      reason: string;
    };

const htmlPattern = /^\s*<(?:!doctype\s+html|html|body|div|span|p|section|article|main|h\d)\b/iu;

const extractFencedPayload = (raw: string): string | null => {
  const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/iu);
  return match?.[1]?.trim() ?? null;
};

const detectFormat = (raw: string): DetectedLlmFormat => {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "empty";
  }

  if (trimmed.startsWith("```") && extractFencedPayload(trimmed)) {
    return "markdown-fenced-json";
  }

  if (trimmed.startsWith("{")) {
    return "json-object";
  }

  if (trimmed.startsWith("[")) {
    return "json-array";
  }

  if (htmlPattern.test(trimmed)) {
    return "html";
  }

  return "text";
};

const normalizeJsonCandidate = (raw: string): { text: string | null; detectedFormat: DetectedLlmFormat } => {
  const detectedFormat = detectFormat(raw);
  const trimmed = raw.trim();

  if (detectedFormat === "empty") {
    return { detectedFormat, text: null };
  }

  if (detectedFormat === "markdown-fenced-json") {
    return { detectedFormat, text: extractFencedPayload(trimmed) };
  }

  if (detectedFormat === "json-object" || detectedFormat === "json-array") {
    return { detectedFormat, text: trimmed };
  }

  const firstObjectBrace = trimmed.indexOf("{");
  const lastObjectBrace = trimmed.lastIndexOf("}");
  if (firstObjectBrace >= 0 && lastObjectBrace > firstObjectBrace) {
    return {
      detectedFormat,
      text: trimmed.slice(firstObjectBrace, lastObjectBrace + 1)
    };
  }

  const firstBracket = trimmed.indexOf("[");
  const lastBracket = trimmed.lastIndexOf("]");
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    return {
      detectedFormat,
      text: trimmed.slice(firstBracket, lastBracket + 1)
    };
  }

  return { detectedFormat, text: null };
};

export const parseLlmJsonWithSchema = <T>(
  raw: string,
  schema: z.ZodType<T>,
  expectedRoot: "object" | "array"
): JsonBoundaryValidationResult<T> => {
  const normalized = normalizeJsonCandidate(raw);

  if (!normalized.text) {
    return {
      ok: false,
      detectedFormat: normalized.detectedFormat,
      normalizedJsonText: null,
      reason: "no-json-object-found"
    };
  }

  try {
    const parsed = JSON.parse(normalized.text) as unknown;
    const rootType = Array.isArray(parsed) ? "array" : typeof parsed === "object" && parsed !== null ? "object" : "scalar";
    if (rootType !== expectedRoot) {
      return {
        ok: false,
        detectedFormat: normalized.detectedFormat,
        normalizedJsonText: normalized.text,
        reason: `root-type-mismatch:${rootType}`
      };
    }

    const validated = schema.safeParse(parsed);
    if (!validated.success) {
      return {
        ok: false,
        detectedFormat: normalized.detectedFormat,
        normalizedJsonText: normalized.text,
        reason: `schema-validation-failed:${JSON.stringify(validated.error.issues)}`
      };
    }

    return {
      ok: true,
      data: validated.data,
      detectedFormat: normalized.detectedFormat,
      normalizedJsonText: normalized.text
    };
  } catch (error) {
    return {
      ok: false,
      detectedFormat: normalized.detectedFormat,
      normalizedJsonText: normalized.text,
      reason: `json-parse-failed:${error instanceof Error ? error.message : "unknown"}`
    };
  }
};
