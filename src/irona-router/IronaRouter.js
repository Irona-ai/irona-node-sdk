"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IronaRouter = void 0;
const base_1 = require("./base");
const requestValidator_1 = require("../utils/requestValidator");
const modelSelect_validator_1 = require("../validators/modelSelect.validator");
const resources = "/api/v1/model-router/select-model"; // TODO: will change this to model-select in the irona-web-server repo
class IronaRouter extends base_1.Base {
    modelSelect(body) {
        const validationResult = (0, requestValidator_1.validateSchema)(modelSelect_validator_1.modelSelectSchema, body);
        if (!validationResult.success) {
            return Promise.reject({
                success: false,
                message: "Validation failed",
                details: validationResult.errors, // Return validation errors
            });
        }
        return this.request(`${resources}`, {
            method: "POST",
            data: body,
            headers: {
                Authorization: "Bearer " + this.apiKey,
                "Content-Type": "application/json",
            },
        });
    }
}
exports.IronaRouter = IronaRouter;
