"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompletionsSchema = void 0;
// completionsSchema.ts
const zod_1 = require("zod");
const modelSelect_schema_1 = require("./modelSelect.schema");
exports.CompletionsSchema = modelSelect_schema_1.ModelSelectSchema.extend({
    temperature: zod_1.z
        .number()
        .min(0, "Temperature must be at least 0")
        .max(1, "Temperature cannot exceed 1")
        .optional(),
    maxRetries: zod_1.z
        .number()
        .int("Max retries must be an integer")
        .positive("Max retries must be a positive integer")
        .optional(),
    maxTokens: zod_1.z
        .number()
        .int("Max tokens must be an integer")
        .positive("Max tokens must be a positive integer")
        .optional(),
    stream: zod_1.z.boolean().optional(),
    search: zod_1.z.boolean().optional(),
});
