"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Globals and OAuth configuration for the Active Directory B2C tenant / application.
 */
exports.creds = {
    // Required. It must be tenant-specific endpoint, common endpoint
    // is not supported to use B2C feature.
    identityMetadata: "https://login.microsoftonline.com/" +
        process.env.TENANT_ID +
        "/v2.0/.well-known/openid-configuration",
    // Required, the client ID of your app in AAD
    clientID: process.env.CLIENT_ID,
    // Required, must be 'code', 'code id_token', 'id_token code' or 'id_token'
    // If you want to get access_token, you must be 'code', 'code id_token' or 'id_token code'
    responseType: "code id_token",
    // Required
    responseMode: "form_post",
    // Required, the reply URL registered in AAD for your app
    redirectUrl: process.env.REPLY_URL,
    // Required if we use http for redirectUrl
    allowHttpForRedirectUrl: true,
    // Required if `responseType` is 'code', 'id_token code' or 'code id_token'.
    // If app key contains '\', replace it with '\\'.
    clientSecret: process.env.CLIENT_SECRET,
    // Required, must be true for B2C
    isB2C: true,
    // Required to set to false if you don't want to validate issuer
    validateIssuer: true,
    // Required if you want to provide the issuer(s) you want to validate instead of using the issuer from metadata
    issuer: undefined,
    // Required to set to true if the `verify` function has 'req' as the first parameter
    passReqToCallback: true,
    // Recommended to set to true. By default we save state in express session, if this option is set to true, then
    // we encrypt state and save it in cookie instead. This option together with { session: false } allows your app
    // to be completely express session free.
    useCookieInsteadOfSession: true,
    // Required if `useCookieInsteadOfSession` is set to true. You can provide multiple set of key/iv pairs for key
    // rollover purpose. We always use the first set of key/iv pair to encrypt cookie, but we will try every set of
    // key/iv pair to decrypt cookie. Key can be any string of length 32, and iv can be any string of length 12.
    cookieEncryptionKeys: [
        { key: process.env.COOKIE_KEY, iv: process.env.COOKIE_IV }
    ],
    // Optional. The additional scope you want besides 'openid'
    // (1) if you want refresh_token, use 'offline_access'
    // (2) if you want access_token, use the clientID
    // scope: ["offline_access"],
    scope: ["user_impersonation"],
    // Optional, 'error', 'warn' or 'info'
    loggingLevel: "error",
    // Optional. The lifetime of nonce in session or cookie, the default value is 3600 (seconds).
    nonceLifetime: undefined,
    // Optional. The max amount of nonce saved in session or cookie, the default value is 10.
    nonceMaxAmount: 5,
    // Optional. The clock skew allowed in token validation, the default value is 300 seconds.
    clockSkew: undefined,
    policyName: process.env.POLICY_NAME
};
exports.policyName = process.env.POLICY_NAME;
exports.resetPasswordPolicyName = process.env.RESET_PASSWORD_POLICY_NAME;
exports.tenantId = process.env.TENANT_ID;
exports.clientName = process.env.CLIENT_NAME;
// The url you need to go to destroy the session with AAD,
// replace <tenant_name> with your tenant name, and
// replace <signin_policy_name> with your signin policy name.
exports.destroySessionUrl = ((("https://login.microsoftonline.com/" +
    process.env.TENANT_ID) +
    "/oauth2/v2.0/logout?p=" +
    process.env.POLICY_NAME) +
    "&post_logout_redirect_uri=" +
    process.env.POST_LOGOUT_URL);
exports.apimUrl = process.env.POST_LOGIN_URL;
exports.azurermResourceGroup = process.env.ARM_RESOURCE_GROUP;
exports.azurermApim = process.env.ARM_APIM;
exports.apimProductName = process.env.APIM_PRODUCT_NAME;
exports.apimUserGroups = process.env.APIM_USER_GROUPS;
exports.adminApiUrl = process.env.ADMIN_API_URL;
exports.adminApiKey = process.env.ADMIN_API_KEY;
exports.subscriptionId = process.env.ARM_SUBSCRIPTION_ID;
exports.logLevel = process.env.LOG_LEVEL;
exports.port = process.env.PORT;
exports.armClientId = process.env.ARM_CLIENT_ID;
exports.armClientSecret = process.env.ARM_CLIENT_SECRET;
//# sourceMappingURL=config.js.map