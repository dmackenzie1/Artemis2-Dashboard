import { EntitySchema } from "@mikro-orm/core";

export class PromptDefinition {
  id!: number;
  key!: string;
  fileName!: string;
  content!: string;
  updatedAt!: Date;
}

export const PromptDefinitionSchema = new EntitySchema<PromptDefinition>({
  class: PromptDefinition,
  tableName: "prompt_definitions",
  properties: {
    id: { type: "number", primary: true, autoincrement: true },
    key: { type: "string", length: 128, unique: true, index: true },
    fileName: { type: "string", length: 255, unique: true, index: true },
    content: { type: "text" },
    updatedAt: { type: "datetime", index: true }
  }
});
