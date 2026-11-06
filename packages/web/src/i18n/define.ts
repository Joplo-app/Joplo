/** Enforce exact keys and interpolation argument tuples, beyond ordinary structural assignment. */
type Exact<S, T> = {
  [K in keyof T]: K extends keyof S
    ? S[K] extends (...args: infer A) => string
      ? T[K] extends (...args: infer B) => string
        ? A extends B ? B extends A ? T[K] : never : never
        : never
      : S[K] extends string ? T[K] extends string ? T[K] : never
      : Exact<S[K], T[K]>
    : never;
};
export const defineDictionary = <S,>() => <T extends S>(dictionary: T & Exact<S, T>): T => dictionary;
