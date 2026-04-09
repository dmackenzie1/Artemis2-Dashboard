export type SourceContextDocument = {
  path: string;
  checksum: string;
  content: string;
};

export type DailyDocumentGroup = {
  day: string;
  documents: SourceContextDocument[];
};

export type DailyDocumentVariant = {
  canonicalPath: string;
  isPartial: boolean;
};

export const dailySummaryTargetWords = {
  min: 5_000,
  max: 10_000
} as const;

export const dailySummaryChunkCharacterLimit = 220_000;
