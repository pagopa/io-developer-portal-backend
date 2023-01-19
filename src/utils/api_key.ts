/**
 * Utilities to handle subscriptions api key
 */
export enum ApiKeyTypeEnum {
  "MANAGE" = "MANAGE"
}

export const MANAGE_APIKEY_PREFIX = "MANAGE-";
const MANAGE_APIKEY_FILTER = `startswith(name, '${MANAGE_APIKEY_PREFIX}')`;

/**
 * User Subscription list filter by api key type
 *
 * @param keyType
 * @returns
 */
export const getSubscriptionFilterByApiKeyType = (
  keyType?: ApiKeyTypeEnum
): string =>
  keyType === ApiKeyTypeEnum.MANAGE
    ? `startswith(name, '${MANAGE_APIKEY_PREFIX}')`
    : `not(${MANAGE_APIKEY_FILTER})`;
