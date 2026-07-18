import {
  BIND,
  HANDLE,
  PERFORM,
  PURE,
  Pure,
  Resumed,
  RESUMED,
  type Computation,
  type Handlers,
} from "./computation.ts";
import { injFor, type Proj, type Variant } from "./utli.ts";

// The stack is heterogeneous: each frame's input/output types only line
// up pairwise with its neighbours (an existential chain), so frames are
// typed against `unknown` and the machine trusts the invariants the
// smart constructors established.
export type StackFrame = Variant<
  "StackFrame",
  {
    BindF: { fn: (x: unknown) => Computation<unknown> };
    PromptF: {
      handlers: Handlers;
      pure?: ((value: unknown) => Computation<unknown>) | undefined;
    };
  }
>;

const inj = injFor<StackFrame>();
const BindF = (fn: (x: unknown) => Computation<unknown>): StackFrame =>
  inj("BindF", { fn });
const PromptF = (
  handlers: Handlers,
  pure?: (value: unknown) => Computation<unknown>,
): StackFrame => inj("PromptF", { handlers, pure });
const isPromptF = (f: StackFrame): f is Proj<StackFrame, "PromptF"> =>
  f._tag === "PromptF";
/**
 * Run to completion, delivering the result to `onDone`
 */
const runMachine = (
  comp: Computation<unknown>,
  onDone: (value: unknown) => void,
) => {
  const stack: StackFrame[] = [];
  let cur: Computation<unknown> = comp;

  const loop = () => {
    while (true) {
      switch (cur._tag) {
        case PURE: {
          const val = cur.args.value;
          const frame = stack.pop();
          if (frame === undefined) {
            return onDone(val);
          }
          switch (frame._tag) {
            case "BindF": {
              cur = frame.args.fn(val);
              break;
            }
            case "PromptF": {
              cur = (frame.args.pure ?? Pure)(val);
              break;
            }
          }
          break;
        }

        // Bind instruction
        case BIND: {
          stack.push(BindF(cur.args.fn));
          cur = cur.args.comp;
          break;
        }

        case PERFORM: {
          const act = cur.args.act;
          // Search from the top of the stack (innermost prompt) for the first PromptF frame with a handler for act
          let prompt: Proj<StackFrame, "PromptF"> | undefined;
          let i = stack.length - 1;
          for (; i >= 0; i -= 1) {
            const f = stack[i]!;
            if (isPromptF(f) && act.label in f.args.handlers) {
              prompt = f;
              break;
            }
          }
          if (prompt === undefined)
            throw new Error(`hoop: Unhandled effect operation '${act.label}'`);

          // non-null: the `in` check above guarantees the clause exists
          const clause = prompt.args.handlers[act.label]!;
          // // Tail-resumptive fast path (Koka's `fun` clauses): the clause
          // // resumes exactly once, immediately, and cannot observe or discard
          // // the continuation — so the continuation never needs to be captured.
          // // The stack stays exactly where it is.
          // if (typeof clause !== "function") {
          //   cur = Pure(clause.fun(act.payload));
          //   break;
          // }

          // General (ctl) path: capture the delimited continuation — every
          // frame above the nearest matching prompt, prompt included — so
          // resuming reinstalls the handler (deep-handler semantics).
          const frames = stack.splice(i);
          const k = (value: unknown) => Resumed(frames, value);
          cur = clause(act.payload, k);
          break;
        }

        case HANDLE: {
          stack.push(PromptF(cur.args.handlers, cur.args.pure));
          cur = cur.args.comp;
          break;
        }

        case RESUMED: {
          for (const frame of cur.args.frames) {
            stack.push(frame);
          }
          cur = Pure(cur.args.value);
        }
      }
    }
  };

  loop();
};

export const run = <A>(comp: Computation<A>): A => {
  let result: unknown;
  runMachine(comp, (value) => {
    result = value;
  });
  // The machine is synchronous: onDone has run by now, and it received
  // the value of `comp`, which the constructors typed as `A`.
  return result as A;
};
