"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const Either_1 = require("fp-ts/lib/Either");
const responses_1 = require("italia-ts-commons/lib/responses");
function OptionalParamMiddleware(name, type) {
    return (request) => __awaiter(this, void 0, void 0, function* () {
        if (request.params[name] === undefined) {
            return Either_1.right(undefined);
        }
        return type
            .decode(request.params[name])
            .mapLeft(responses_1.ResponseErrorFromValidationErrors(type));
    });
}
exports.OptionalParamMiddleware = OptionalParamMiddleware;
//# sourceMappingURL=optional_param.js.map