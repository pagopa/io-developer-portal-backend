declare module "adf-to-md" {
  export interface IConvertResult {
    readonly result: string;
    readonly warnings: Set<string>;
  }

  export function convert(adf: unknown): IConvertResult;
}
