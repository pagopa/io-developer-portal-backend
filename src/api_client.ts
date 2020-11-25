import nodeFetch from "node-fetch";
import { createClient } from "../generated/api/client";
import * as config from "./config";

export const adminBaseUrl = config.adminApiUrl;
export const adminToken = config.adminApiKey;

// tslint:disable-next-line: no-any
const fetchApi: typeof fetch = (nodeFetch as any) as typeof fetch;

export const notificationApiClient = createClient<"SubscriptionKey">({
  baseUrl: adminBaseUrl,
  fetchApi,
  withDefaults: op => params => op({ SubscriptionKey: adminToken, ...params })
});

export type APIClient = typeof notificationApiClient;
