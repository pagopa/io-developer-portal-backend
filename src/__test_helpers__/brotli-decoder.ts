import { jest } from "@jest/globals";
import * as zlib from "zlib";

type BrotliDecoderName =
  | "createBrotliDecompress"
  | "BrotliDecompress"
  | "brotliDecompress"
  | "brotliDecompressSync";

const observeBrotliDecoder = (
  name: BrotliDecoderName
): {
  readonly decoder: jest.Mock<(...args: ReadonlyArray<unknown>) => void>;
  readonly name: BrotliDecoderName;
  readonly restore: () => void;
} => {
  const descriptor = Object.getOwnPropertyDescriptor(zlib, name);
  if (!descriptor) {
    throw new Error(`Brotli decoder ${name} descriptor is not available`);
  }
  const original: unknown = descriptor.value;
  if (typeof original !== "function") {
    throw new Error(`Brotli decoder ${name} is not a function`);
  }
  const decoder = jest
    .fn<(...args: ReadonlyArray<unknown>) => void>()
    .mockName(`zlib.${name}`);
  Object.defineProperty(zlib, name, {
    ...descriptor,
    value: new Proxy(original, {
      apply: (target, thisArg, args): unknown => {
        decoder(...args);
        return Reflect.apply(target, thisArg, args);
      },
      construct: (target, args, newTarget): object => {
        decoder(...args);
        return Reflect.construct(target, args, newTarget);
      }
    })
  });

  return {
    decoder,
    name,
    restore: (): void => {
      Object.defineProperty(zlib, name, descriptor);
    }
  };
};

// Install before client imports so cached references also point to the spies.
export const brotliDecoders: ReadonlyArray<ReturnType<
  typeof observeBrotliDecoder
>> = [
  observeBrotliDecoder("createBrotliDecompress"),
  observeBrotliDecoder("BrotliDecompress"),
  observeBrotliDecoder("brotliDecompress"),
  observeBrotliDecoder("brotliDecompressSync")
];
