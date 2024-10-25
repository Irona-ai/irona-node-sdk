"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateSchema = validateSchema;
var zod_1 = require("zod");
var logger_1 = require("./logger"); // Assuming logger is in the same directory
/**
 * Validates the input data against the provided zod schema.
 * @param schema - The zod schema to validate against.
 * @param data - The data to validate.
 * @returns An object with a success flag and optional errors if validation fails.
 */
function validateSchema(schema, data) {
    try {
        schema.parse(data); // This will throw if validation fails
        return { success: true }; // Validation passed
    }
    catch (error) {
        if (error instanceof zod_1.ZodError) {
            var errorMessages = error.errors.map(function (issue) { return ({
                message: "".concat(issue.path.join("."), " is ").concat(issue.message),
            }); });
            // Log the validation error
            logger_1.logger.error("Validation error: ", errorMessages);
            return {
                success: false,
                errors: errorMessages, // Return detailed validation errors
            };
        }
        // Log unexpected errors
        logger_1.logger.error("Unexpected error during validation", error);
        return {
            success: false,
            errors: "Unexpected error during validation",
        };
    }
}
