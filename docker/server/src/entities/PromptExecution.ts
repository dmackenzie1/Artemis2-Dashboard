import { EntitySchema } from "@mikro-orm/core";
import { PromptDefinition } from "./PromptDefinition.js";

export class PromptExecution {
  id!: number;
  prompt!: PromptDefinition;
  responseDay!: string | null;
  startedAt!: Date;
  sentAt!: Date;
  receivedAt!: Date | null;
  status!: "running" | "success" | "failed";
  submittedText!: string;
  output!: string;
  errorMessage!: string | null;
}

export const PromptExecutionSchema = new EntitySchema<PromptExecution>({
  class: PromptExecution,
  tableName: "prompt_executions",
  properties: {
    id: { type: "number", primary: true, autoincrement: true },
    prompt: { kind: "m:1", entity: () => PromptDefinition, index: true },
    responseDay: { type: "string", length: 64, index: true, nullable: true },
    startedAt: { type: "datetime", index: true },
    sentAt: { type: "datetime", index: true },
    receivedAt: { type: "datetime", nullable: true, index: true },
    status: { type: "string", length: 16, index: true },
    submittedText: { type: "text", default: "" },
    output: { type: "text" },
    errorMessage: { type: "text", nullable: true }
  }
});
