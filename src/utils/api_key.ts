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
 * _(if **keyType** is null, MANAGE Subscriptions are excluded)_
 *
 * @param keyType
 * @returns
 */
export const getSubscriptionFilterByApiKeyType = (
  keyType?: ApiKeyTypeEnum
): string =>
  keyType === ApiKeyTypeEnum.MANAGE
    ? MANAGE_APIKEY_FILTER
    : `not(${MANAGE_APIKEY_FILTER})`;
