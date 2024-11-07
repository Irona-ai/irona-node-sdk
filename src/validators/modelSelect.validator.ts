import { z } from "zod";
import { MessageSchema, ModelSchema } from "./common.validators";

export const ModelSelectSchema = z.object({
  messages: z.array(MessageSchema).nonempty("Messages array cannot be empty"),
  models: z.array(ModelSchema).nonempty("Models array cannot be empty"),
});

export type ModelSelectPayload = z.infer<typeof ModelSelectSchema>;
