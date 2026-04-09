import { EntitySchema } from "@mikro-orm/core";

export class IngestionSourceFile {
  sourceFile!: string;
  checksum!: string;
  day!: string;
  rowCount!: number;
  updatedAt!: Date;
}

export const IngestionSourceFileSchema = new EntitySchema<IngestionSourceFile>({
  class: IngestionSourceFile,
  tableName: "ingestion_source_files",
  properties: {
    sourceFile: { type: "string", length: 255, primary: true },
    checksum: { type: "string", length: 64 },
    day: { type: "string", length: 64, index: true },
    rowCount: { type: "number" },
    updatedAt: { type: "datetime", index: true }
  }
});
