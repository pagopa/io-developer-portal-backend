import {
  buildApimFilter,
  FilterCompositionEnum,
  FilterFieldEnum,
  FilterSupportedFunctionsEnum
} from "./apim_filters";

/**
 * Utilities to handle subscriptions api key
 */
export enum ApiKeyTypeEnum {
  "MANAGE" = "MANAGE"
}

export const MANAGE_APIKEY_PREFIX = "MANAGE-";

/**
 * User Subscription list filtered by name not startswith 'MANAGE-'
 *
 * @returns APIM *filter* property
 */
export const subscriptionsExceptManageOneApimFilter = () =>
  buildApimFilter({
    composeFilter: FilterCompositionEnum.none,
    field: FilterFieldEnum.name,
    filterType: FilterSupportedFunctionsEnum.startswith,
    inverse: true,
    value: MANAGE_APIKEY_PREFIX
  }).fold("", result => result);
