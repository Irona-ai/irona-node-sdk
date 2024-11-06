import { z } from "zod";
import { messageSchema, modelSchema } from "./common.validators";

export const modelSelectSchema = z.object({
  messages: z.array(messageSchema).nonempty("Messages array cannot be empty"),
  models: z.array(modelSchema).nonempty("Models array cannot be empty"),
});

export type ModelSelectPayload = z.infer<typeof modelSelectSchema>;
