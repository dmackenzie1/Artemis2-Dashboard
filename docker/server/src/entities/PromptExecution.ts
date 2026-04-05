import { EntitySchema } from "@mikro-orm/core";
import { PromptDefinition } from "./PromptDefinition.js";

export class PromptExecution {
  id!: number;
  prompt!: PromptDefinition;
  startedAt!: Date;
  finishedAt!: Date | null;
  status!: "running" | "success" | "failed";
  output!: string;
  errorMessage!: string | null;
}

export const PromptExecutionSchema = new EntitySchema<PromptExecution>({
  class: PromptExecution,
  tableName: "prompt_executions",
  properties: {
    id: { type: "number", primary: true, autoincrement: true },
    prompt: { kind: "m:1", entity: () => PromptDefinition, index: true },
    startedAt: { type: "datetime", index: true },
    finishedAt: { type: "datetime", nullable: true, index: true },
    status: { type: "string", length: 16, index: true },
    output: { type: "text" },
    errorMessage: { type: "text", nullable: true }
  }
});
