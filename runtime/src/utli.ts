export type Variant<
  T extends string,
  C extends Record<string, Record<string, any>>,
> = {
  [K in keyof C]: { readonly _typename: T; readonly _tag: K; args: C[K] };
}[keyof C];

export type Proj<T extends Variant<any, any>, K extends T["_tag"]> = Extract<
  T,
  { _tag: K }
>;

export const injFor =
  <T extends Variant<any, any>>() =>
  <K extends T["_tag"]>(key: K, args: Proj<T, K>["args"]): Proj<T, K> =>
    ({ _tag: key, args }) as Proj<T, K>;
