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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __await = (this && this.__await) || function (v) { return this instanceof __await ? (this.v = v, this) : new __await(v); }
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
var __asyncGenerator = (this && this.__asyncGenerator) || function (thisArg, _arguments, generator) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var g = generator.apply(thisArg, _arguments || []), i, q = [];
    return i = Object.create((typeof AsyncIterator === "function" ? AsyncIterator : Object).prototype), verb("next"), verb("throw"), verb("return", awaitReturn), i[Symbol.asyncIterator] = function () { return this; }, i;
    function awaitReturn(f) { return function (v) { return Promise.resolve(v).then(f, reject); }; }
    function verb(n, f) { if (g[n]) { i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; if (f) i[n] = f(i[n]); } }
    function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
    function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
    function fulfill(value) { resume("next", value); }
    function reject(value) { resume("throw", value); }
    function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatPerplexity = void 0;
// import { SimpleChatModel } from "@langchain/core/language_models/chat_models";
var SimpleChatModel = require("@langchain/core/language_models/chat_models").SimpleChatModel;
var messages_1 = require("@langchain/core/messages");
var outputs_1 = require("@langchain/core/outputs");
var axios_1 = require("axios");
/**
 * Perplexity model for LangChain.
 */
var ChatPerplexity = /** @class */ (function (_super) {
    __extends(ChatPerplexity, _super);
    function ChatPerplexity(chatModelConfig) {
        var _this = _super.call(this, chatModelConfig) || this;
        var apiKey = chatModelConfig.apiKey, modelName = chatModelConfig.modelName, rest = __rest(chatModelConfig, ["apiKey", "modelName"]);
        _this.apiKey = apiKey;
        _this.model = modelName;
        return _this;
    }
    ChatPerplexity.prototype._llmType = function () {
        return "perplexity";
    };
    ChatPerplexity.prototype._call = function (messages) {
        return __awaiter(this, void 0, void 0, function () {
            var data, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!messages.length) {
                            throw new Error("No messages provided.");
                        }
                        // Pass `runManager?.getChild()` when invoking internal runnables to enable tracing
                        // await subRunnable.invoke(params, runManager?.getChild());
                        if (typeof messages[0].content !== "string") {
                            throw new Error("Multimodal messages are not supported.");
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, axios_1.default.post("https://api.perplexity.ai/chat/completions", {
                                model: this.model,
                                messages: messages.map(function (m) { return ({
                                    role: m.getType() === "human" ? "user" : m.getType(),
                                    content: m.content,
                                }); }),
                            }, {
                                headers: {
                                    Authorization: "Bearer ".concat(this.apiKey),
                                },
                            })];
                    case 2:
                        data = (_a.sent()).data;
                        return [2 /*return*/, new messages_1.AIMessage(data.choices[0].message.content)];
                    case 3:
                        error_1 = _a.sent();
                        if (axios_1.default.isAxiosError(error_1) && error_1.response) {
                            throw new Error("Perplexity API error: ".concat(error_1.response.statusText));
                        }
                        throw error_1;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    ChatPerplexity.prototype._streamResponseChunks = function (messages, _options, runManager) {
        return __asyncGenerator(this, arguments, function _streamResponseChunks_1() {
            var response, buffer, _a, _b, _c, chunkBuffer, rawPayloads, _i, rawPayloads_1, rawPayload, payload, textChunk, finish_reason, err_1, e_1_1, error_2;
            var _d, e_1, _e, _f;
            var _g, _h, _j, _k, _l, _m, _o, _p, _q;
            return __generator(this, function (_r) {
                switch (_r.label) {
                    case 0:
                        if (!messages.length) {
                            throw new Error("No messages provided.");
                        }
                        // Pass `runManager?.getChild()` when invoking internal runnables to enable tracing
                        // await subRunnable.invoke(params, runManager?.getChild());
                        if (typeof messages[0].content !== "string") {
                            throw new Error("Multimodal messages are not supported.");
                        }
                        _r.label = 1;
                    case 1:
                        _r.trys.push([1, 25, , 26]);
                        return [4 /*yield*/, __await(axios_1.default.post("https://api.perplexity.ai/chat/completions", {
                                model: this.model,
                                messages: messages.map(function (m) { return ({
                                    role: m.getType() === "human" ? "user" : m.getType(),
                                    content: m.content,
                                }); }),
                                stream: true, // Conceptual flag for streaming response
                            }, {
                                headers: {
                                    Authorization: "Bearer ".concat(this.apiKey),
                                },
                                responseType: "stream",
                            }))];
                    case 2:
                        response = _r.sent();
                        buffer = "";
                        _r.label = 3;
                    case 3:
                        _r.trys.push([3, 18, 19, 24]);
                        _a = true, _b = __asyncValues(response.data);
                        _r.label = 4;
                    case 4: return [4 /*yield*/, __await(_b.next())];
                    case 5:
                        if (!(_c = _r.sent(), _d = _c.done, !_d)) return [3 /*break*/, 17];
                        _f = _c.value;
                        _a = false;
                        chunkBuffer = _f;
                        // Accumulate the chunk buffer
                        buffer += chunkBuffer.toString();
                        rawPayloads = buffer.split("\r\n");
                        buffer = rawPayloads.pop() || ""; // Save any leftover data in the buffer
                        _i = 0, rawPayloads_1 = rawPayloads;
                        _r.label = 6;
                    case 6:
                        if (!(_i < rawPayloads_1.length)) return [3 /*break*/, 16];
                        rawPayload = rawPayloads_1[_i];
                        if (!rawPayload.includes("[DONE]")) return [3 /*break*/, 8];
                        return [4 /*yield*/, __await(void 0)];
                    case 7: return [2 /*return*/, _r.sent()]; // End the stream once we hit the "[DONE]" marker
                    case 8:
                        if (!rawPayload.trim() || !rawPayload.startsWith("data:")) {
                            return [3 /*break*/, 15];
                        }
                        _r.label = 9;
                    case 9:
                        _r.trys.push([9, 14, , 15]);
                        payload = JSON.parse(rawPayload.replace("data: ", ""));
                        textChunk = (_k = (_j = (_h = (_g = payload === null || payload === void 0 ? void 0 : payload.choices) === null || _g === void 0 ? void 0 : _g[0]) === null || _h === void 0 ? void 0 : _h.delta) === null || _j === void 0 ? void 0 : _j.content) !== null && _k !== void 0 ? _k : "";
                        finish_reason = (_m = (_l = payload === null || payload === void 0 ? void 0 : payload.choices) === null || _l === void 0 ? void 0 : _l[0]) === null || _m === void 0 ? void 0 : _m.finish_reason;
                        if (!textChunk) return [3 /*break*/, 12];
                        return [4 /*yield*/, __await(new outputs_1.ChatGenerationChunk({
                                message: new messages_1.AIMessageChunk({
                                    content: textChunk,
                                    usage_metadata: {
                                        input_tokens: (_o = payload === null || payload === void 0 ? void 0 : payload.usage) === null || _o === void 0 ? void 0 : _o.prompt_tokens,
                                        output_tokens: (_p = payload === null || payload === void 0 ? void 0 : payload.usage) === null || _p === void 0 ? void 0 : _p.completion_tokens,
                                        total_tokens: (_q = payload === null || payload === void 0 ? void 0 : payload.usage) === null || _q === void 0 ? void 0 : _q.total_tokens,
                                    },
                                    response_metadata: {
                                        finish_reason: finish_reason,
                                        finishReason: finish_reason,
                                    },
                                }),
                                text: textChunk,
                            }))];
                    case 10: return [4 /*yield*/, _r.sent()];
                    case 11:
                        _r.sent();
                        _r.label = 12;
                    case 12: return [4 /*yield*/, __await((runManager === null || runManager === void 0 ? void 0 : runManager.handleLLMNewToken(textChunk)))];
                    case 13:
                        _r.sent();
                        return [3 /*break*/, 15];
                    case 14:
                        err_1 = _r.sent();
                        // Handle any errors in JSON parsing (e.g., incomplete or malformed JSON)
                        console.error("Failed to parse chunk:", rawPayload, err_1);
                        return [3 /*break*/, 15];
                    case 15:
                        _i++;
                        return [3 /*break*/, 6];
                    case 16:
                        _a = true;
                        return [3 /*break*/, 4];
                    case 17: return [3 /*break*/, 24];
                    case 18:
                        e_1_1 = _r.sent();
                        e_1 = { error: e_1_1 };
                        return [3 /*break*/, 24];
                    case 19:
                        _r.trys.push([19, , 22, 23]);
                        if (!(!_a && !_d && (_e = _b.return))) return [3 /*break*/, 21];
                        return [4 /*yield*/, __await(_e.call(_b))];
                    case 20:
                        _r.sent();
                        _r.label = 21;
                    case 21: return [3 /*break*/, 23];
                    case 22:
                        if (e_1) throw e_1.error;
                        return [7 /*endfinally*/];
                    case 23: return [7 /*endfinally*/];
                    case 24: return [3 /*break*/, 26];
                    case 25:
                        error_2 = _r.sent();
                        console.error("Error in streaming generator:", error_2);
                        throw error_2;
                    case 26: return [2 /*return*/];
                }
            });
        });
    };
    return ChatPerplexity;
}(SimpleChatModel));
exports.ChatPerplexity = ChatPerplexity;
