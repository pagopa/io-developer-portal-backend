/**
 * Utilities to handle session objects
 */

import * as t from "io-ts";
import { AdUser } from "../auth-strategies/azure_ad_strategy";

/**
 * Abstract shape for user data stored in session
 */
export type SessionUser = t.TypeOf<typeof SessionUser>;
export const SessionUser = t.intersection([
  t.interface({ kind: t.literal("azure-ad") }),
  AdUser
]);
