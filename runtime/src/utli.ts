// Type-level-only brand: keeps Variants of different names from being
// assignable to each other. The property never exists at runtime.
declare const variantBrand: unique symbol;

export type Variant<
  T extends string,
  C extends Record<string, Record<string, any>>,
> = {
  [K in keyof C]: {
    readonly [variantBrand]?: T;
    readonly _tag: K;
    args: C[K];
  };
}[keyof C];

export type Proj<T extends Variant<any, any>, K extends T["_tag"]> = Extract<
  T,
  { _tag: K }
>;

export const injFor =
  <T extends Variant<any, any>>() =>
  <K extends T["_tag"]>(key: K, args: Proj<T, K>["args"]): Proj<T, K> =>
    ({ _tag: key, args }) as Proj<T, K>;
