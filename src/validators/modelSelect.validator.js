"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.modelSelectSchema = void 0;
const zod_1 = require("zod");
exports.modelSelectSchema = zod_1.z.object({
    messages: zod_1.z
        .array(zod_1.z.object({
        role: zod_1.z.enum(["system", "assistant", "user"]),
        content: zod_1.z.string().min(1, "Content cannot be empty"), // Non-empty string
    }))
        .nonempty("Messages array cannot be empty"), // Ensure array is not empty
    llm_providers: zod_1.z
        .array(zod_1.z.object({
        provider: zod_1.z.string().min(1, "Provider cannot be empty"), // Non-empty string
        model: zod_1.z.string().min(1, "Model cannot be empty"), // Non-empty string
    }))
        .nonempty("LLM Providers array cannot be empty"), // Ensure array is not empty
});
