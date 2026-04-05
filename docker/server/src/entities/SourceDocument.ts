import { EntitySchema } from "@mikro-orm/core";

export class SourceDocument {
  id!: number;
  relativePath!: string;
  checksum!: string;
  content!: string;
  fileModifiedAt!: Date;
  ingestedAt!: Date;
}

export const SourceDocumentSchema = new EntitySchema<SourceDocument>({
  class: SourceDocument,
  tableName: "source_documents",
  properties: {
    id: { type: "number", primary: true, autoincrement: true },
    relativePath: { type: "string", length: 512, unique: true, index: true },
    checksum: { type: "string", length: 128 },
    content: { type: "text" },
    fileModifiedAt: { type: "datetime" },
    ingestedAt: { type: "datetime", index: true }
  }
});
