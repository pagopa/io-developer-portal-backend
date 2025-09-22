declare module "adf-to-md" {
  export interface ConvertResult {
    result: string;
    warnings: Set<string>;
  }

  export function convert(adf: unknown): ConvertResult;
}
