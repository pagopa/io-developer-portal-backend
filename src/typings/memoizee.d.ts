import * as memoizee from "memoizee";

declare module "memoizee" {
  interface Options<F extends (...args: any[]) => any> {
    profileName?: string;
  }
}
