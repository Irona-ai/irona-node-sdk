import { z } from "zod";
import { messageSchema, llmProviderSchema } from "./common.validators";

export const modelSelectSchema = z.object({
  messages: z.array(messageSchema).nonempty("Messages array cannot be empty"),
  llm_providers: z
    .array(llmProviderSchema)
    .nonempty("LLM Providers array cannot be empty"),
});

export type ModelSelectPayload = z.infer<typeof modelSelectSchema>;
