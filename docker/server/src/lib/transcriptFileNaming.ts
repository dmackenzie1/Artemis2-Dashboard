import { dayjs } from "./dayjs.js";

export type TranscriptFileDescriptor = {
  fileName: string;
  day: string;
  kind: "full-day" | "partial-sequence" | "hour-range" | "unstructured";
  partialIndex: number | null;
  hourStart: number | null;
  hourEnd: number | null;
};

const normalizeHour = (value: string): number | null => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 23) {
    return null;
  }

  return parsed;
};

export const parseTranscriptFileName = (fileName: string): TranscriptFileDescriptor | null => {
  const trimmed = fileName.trim();
  const normalized = trimmed.toLowerCase();
  const dayMatch = normalized.match(/^(\d{4}-\d{2}-\d{2})/u);
  const day = dayMatch?.[1] ?? null;
  if (!day || !dayjs(day, "YYYY-MM-DD", true).isValid()) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}_summary\.csv$/u.test(normalized)) {
    return {
      fileName: trimmed,
      day,
      kind: "full-day",
      partialIndex: null,
      hourStart: 0,
      hourEnd: 23
    };
  }

  const partialMatch = normalized.match(/^\d{4}-\d{2}-\d{2}_partial_(\d+)\.csv$/u);
  if (partialMatch?.[1]) {
    return {
      fileName: trimmed,
      day,
      kind: "partial-sequence",
      partialIndex: Number.parseInt(partialMatch[1], 10),
      hourStart: null,
      hourEnd: null
    };
  }

  const hourRangeMatch = normalized.match(/^(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})\.csv$/u);
  if (hourRangeMatch?.[2] && hourRangeMatch[3]) {
    const hourStart = normalizeHour(hourRangeMatch[2]);
    const hourEnd = normalizeHour(hourRangeMatch[3]);
    if (hourStart !== null && hourEnd !== null && hourEnd >= hourStart) {
      return {
        fileName: trimmed,
        day,
        kind: "hour-range",
        partialIndex: null,
        hourStart,
        hourEnd
      };
    }
  }

  return {
    fileName: trimmed,
    day,
    kind: "unstructured",
    partialIndex: null,
    hourStart: null,
    hourEnd: null
  };
};

export const compareTranscriptFiles = (left: string, right: string): number => {
  const leftParsed = parseTranscriptFileName(left);
  const rightParsed = parseTranscriptFileName(right);

  if (!leftParsed && !rightParsed) {
    return left.localeCompare(right);
  }

  if (!leftParsed) {
    return 1;
  }

  if (!rightParsed) {
    return -1;
  }

  if (leftParsed.day !== rightParsed.day) {
    return leftParsed.day.localeCompare(rightParsed.day);
  }

  const kindRank: Record<TranscriptFileDescriptor["kind"], number> = {
    "full-day": 0,
    "hour-range": 1,
    "partial-sequence": 2,
    unstructured: 3
  };

  if (kindRank[leftParsed.kind] !== kindRank[rightParsed.kind]) {
    return kindRank[leftParsed.kind] - kindRank[rightParsed.kind];
  }

  if (leftParsed.kind === "hour-range" && rightParsed.kind === "hour-range") {
    const leftStart = leftParsed.hourStart ?? 0;
    const rightStart = rightParsed.hourStart ?? 0;
    if (leftStart !== rightStart) {
      return leftStart - rightStart;
    }
  }

  if (leftParsed.kind === "partial-sequence" && rightParsed.kind === "partial-sequence") {
    const leftIndex = leftParsed.partialIndex ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = rightParsed.partialIndex ?? Number.MAX_SAFE_INTEGER;
    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex;
    }
  }

  return left.localeCompare(right);
};
