import { EntitySchema } from "@mikro-orm/core";
import { PromptDefinition } from "./PromptDefinition.js";

export class PromptExecution {
  id!: number;
  prompt!: PromptDefinition;
  componentId!: string;
  cacheKey!: string;
  cacheHit!: boolean;
  responseDay!: string | null;
  startedAt!: Date;
  sentAt!: Date;
  receivedAt!: Date | null;
  finishedAt!: Date | null;
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
    componentId: { type: "string", length: 128, index: true },
    cacheKey: { type: "string", length: 64, index: true },
    cacheHit: { type: "boolean", default: false, index: true },
    responseDay: { type: "string", length: 64, index: true, nullable: true },
    startedAt: { type: "datetime", index: true },
    sentAt: { type: "datetime", index: true },
    receivedAt: { type: "datetime", nullable: true, index: true },
    finishedAt: { type: "datetime", nullable: true, index: true },
    status: { type: "string", length: 16, index: true },
    submittedText: { type: "text", default: "" },
    output: { type: "text" },
    errorMessage: { type: "text", nullable: true }
  }
});
