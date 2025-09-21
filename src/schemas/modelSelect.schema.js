"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelSelectSchema = void 0;
const zod_1 = require("zod");
const common_schema_1 = require("./common.schema");
exports.ModelSelectSchema = zod_1.z.object({
    topk_models: zod_1.z.number().int().optional(),
    messages: zod_1.z.array(common_schema_1.MessageSchema).nonempty("Messages array cannot be empty"),
    models: zod_1.z.array(common_schema_1.ModelSchema).nonempty("Models array cannot be empty"),
    fallback_models: zod_1.z.array(common_schema_1.ModelSchema).optional(),
    kwargs: zod_1.z.record(zod_1.z.any()).optional(),
    search: zod_1.z.boolean().optional(),
});
