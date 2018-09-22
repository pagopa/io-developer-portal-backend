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
const apim_operations_1 = require("../apim_operations");
// TODO: this must be cached until the token expire
// actually we get a new token for every request !
function getApiClientMiddleware() {
    return (_) => __awaiter(this, void 0, void 0, function* () { return Either_1.right(yield apim_operations_1.newApiClient()); });
}
exports.getApiClientMiddleware = getApiClientMiddleware;
//# sourceMappingURL=api_client.js.map