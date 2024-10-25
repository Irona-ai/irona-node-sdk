"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IronaAI = void 0;
var IronaRouter_1 = require("./irona-router/IronaRouter");
require("dotenv").config();
var IronaAI = /** @class */ (function () {
    function IronaAI(config) {
        config.baseUrl = config.baseUrl || process.env.BASE_URL;
        this.ironaRouter = new IronaRouter_1.IronaRouter(config);
        // this.llmService = new LLMService(apiKey);
    }
    IronaAI.prototype.modelSelect = function (body) {
        return this.ironaRouter.modelSelect(body);
    };
    return IronaAI;
}());
exports.IronaAI = IronaAI;
exports.default = IronaAI;
