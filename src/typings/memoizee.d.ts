import * as memoizee from "memoizee";

declare module "memoizee" {
  interface Options {
    profileName?: string;
  }
}
