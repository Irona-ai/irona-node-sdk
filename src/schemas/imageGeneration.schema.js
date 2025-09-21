"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImageGenerationSchema = void 0;
const zod_1 = require("zod");
const common_schema_1 = require("./common.schema");
exports.ImageGenerationSchema = zod_1.z.object({
    prompt: zod_1.z.string().min(1, "Prompt is required for image generation"),
    models: zod_1.z.array(common_schema_1.ModelSchema).nonempty("Models array cannot be empty"),
    fallback_models: zod_1.z.array(common_schema_1.ModelSchema).optional(),
    temperature: zod_1.z.number().min(0).max(1).optional(),
    maxRetries: zod_1.z.number().int().positive().optional(),
    topk_models: zod_1.z.number().int().optional(),
    kwargs: zod_1.z.record(zod_1.z.any()).optional(),
});
