import type { StackFrame } from "./machine.ts";
import { injFor, type Variant } from "./utli.ts";

export type Action = { label: string; payload: unknown[] };
export type Continuation<X = unknown, A = unknown> = (x: X) => Computation<A>;

// A handler clause. It runs in the context *outside* the prompt; calling
// `resume` reinstalls the captured continuation, prompt included
// (deep-handler semantics). `B` is the answer type of the enclosing
// Handle: both the clause's result and what `resume` yields (the rest of
// the computation already passed through the return clause).
export type Clause<B = unknown> = (
  payload: unknown[],
  resume: Continuation<unknown, B>,
) => Computation<B>;
export type Handlers<B = unknown> = Record<string, Clause<B>>;

// `A` is the type of the value the computation produces. Type parameters
// that only connect adjacent nodes (e.g. the intermediate type of Bind)
// are existential — TS cannot express those, so they are erased to
// `unknown` in the node payloads and re-introduced by the smart
// constructors below.
export type Computation<A> = Variant<
  "Computation",
  {
    Pure: { value: A };
    Bind: { comp: Computation<unknown>; fn: (x: unknown) => Computation<A> };
    Perform: { act: Action };
    Handle: {
      pure: (value: unknown) => Computation<A>;
      handlers: Handlers<A>;
      comp: Computation<unknown>;
    };
    // Reinstall a captured stack segment, then continue with `value`.
    // package internal: this should not be exported to PS world.
    Resumed: { frames: StackFrame[]; value: unknown };
  }
>;

export const PURE = "Pure" as const;
export const BIND = "Bind" as const;
export const PERFORM = "Perform" as const;
export const HANDLE = "Handle" as const;
export const RESUMED = "Resumed" as const;

// The single type-erasure point of this module: every smart constructor
// funnels through this untyped injector and re-establishes the precise
// types in its own signature.
const inj = injFor<Computation<any>>();

export const Pure = <A>(value: A): Computation<A> => inj(PURE, { value });
export const Bind = <X, A>(
  comp: Computation<X>,
  fn: (x: X) => Computation<A>,
): Computation<A> =>
  inj(BIND, {
    comp: comp as Computation<unknown>,
    fn: fn as Continuation<unknown, A>,
  });
export const Perform = <A = unknown>(act: Action): Computation<A> =>
  inj(PERFORM, { act });
export const Handle = <A, B>(
  pure: (value: A) => Computation<B>,
  handlers: Handlers<B>,
  comp: Computation<A>,
): Computation<B> =>
  inj(HANDLE, {
    pure: pure as Continuation<unknown, B>,
    handlers,
    comp: comp as Computation<unknown>,
  });
export const Resumed = (
  frames: StackFrame[],
  value: unknown,
): Computation<unknown> => inj(RESUMED, { frames, value });
