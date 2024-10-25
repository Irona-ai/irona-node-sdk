"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.IronaRouter = void 0;
var base_1 = require("./base");
var requestValidator_1 = require("../utils/requestValidator");
var modelSelect_validator_1 = require("../validators/modelSelect.validator");
var resources = "/api/v1/model-router/select-model"; // TODO: will change this to model-select in the irona-web-server repo
var IronaRouter = /** @class */ (function (_super) {
    __extends(IronaRouter, _super);
    function IronaRouter() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    IronaRouter.prototype.modelSelect = function (body) {
        var validationResult = (0, requestValidator_1.validateSchema)(modelSelect_validator_1.modelSelectSchema, body);
        if (!validationResult.success) {
            return Promise.reject({
                success: false,
                message: "Validation failed",
                details: validationResult.errors, // Return validation errors
            });
        }
        return this.request("".concat(resources), {
            method: "POST",
            data: body,
            headers: {
                Authorization: "Bearer " + this.apiKey,
                "Content-Type": "application/json",
            },
        });
    };
    return IronaRouter;
}(base_1.Base));
exports.IronaRouter = IronaRouter;
