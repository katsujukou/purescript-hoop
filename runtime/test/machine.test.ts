import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Pure,
  Bind,
  Perform,
  Handle,
  type Computation,
} from "../src/computation.ts";
import { run } from "../src/machine.ts";

// `A` asserts what type the handler will resume this operation with.
// A trust point that TS cannot verify (on the PS side the type system guarantees it).
const act = <A = unknown>(label: string, ...payload: unknown[]) =>
  Perform<A>({ label, payload });
const id = <A>(v: A) => Pure(v);

test("pure/bind", () => {
  const result: number = run(Bind(Pure(1), (x) => Pure(x + 1)));
  assert.equal(result, 2);
});

test("resume once", () => {
  const result = run(
    Handle(
      id,
      { ask: (_p, k) => k(42) },
      Bind(act<number>("ask"), (x) => Pure(x + 1)),
    ),
  );
  assert.equal(result, 43);
});

test("abort: discard the continuation and return a value immediately", () => {
  const result = run(
    Handle(
      id,
      { fail: (_p, _k) => Pure("aborted") },
      Bind(act("fail"), (_x) => Pure("should not reach")),
    ),
  );
  assert.equal(result, "aborted");
});

test("deep semantics through the return clause (pure)", () => {
  const result = run(
    Handle(
      (v: number) => Pure(v * 10),
      { ask: (_p, k) => k(1) },
      act<number>("ask"),
    ),
  );
  assert.equal(result, 10);
});

test("continuation after resume: k's result is the value already processed by the return clause", () => {
  const result = run(
    Handle(
      (v: number) => Pure(v * 10),
      { ask: (_p, k) => Bind(k(1), (r) => Pure((r as number) + 100)) },
      act<number>("ask"),
    ),
  );
  assert.equal(result, 110);
});

test("nested handlers and effect forwarding", () => {
  const result = run(
    Handle(
      id,
      { b: (_p, k) => k("B") },
      Handle(
        id,
        { a: (_p, k) => k("A") },
        Bind(act<string>("b"), (vb) =>
          Bind(act<string>("a"), (va) => Pure([vb, va])),
        ),
      ),
    ),
  );
  assert.deepEqual(result, ["B", "A"]);
});

test("state effect (get/put)", () => {
  let s = 0;
  const result = run(
    Handle(
      id,
      {
        get: (_p, k) => k(s),
        put: ([v], k) => {
          s = v as number;
          return k(undefined);
        },
      },
      Bind(act("put", 5), () => Bind(act<number>("get"), (x) => Pure(x * 2))),
    ),
  );
  assert.equal(result, 10);
});

test("multi-shot continuation (calling k twice)", () => {
  const result = run(
    Handle(
      id,
      {
        choice: (_p, k) =>
          Bind(k(true), (a) => Bind(k(false), (b) => Pure([a, b]))),
      },
      Bind(act<boolean>("choice"), (x) => Pure(x ? 1 : 2)),
    ),
  );
  assert.deepEqual(result, [1, 2]);
});

test("stack safety (200k binds)", () => {
  let c: Computation<number> = Pure(0);
  for (let i = 0; i < 200_000; i++) c = Bind(c, (x) => Pure(x + 1));
  assert.equal(run(c), 200_000);
});

test("unhandled effect throws an error", () => {
  assert.throws(() => run(act("nope")), /Unhandled effect operation 'nope'/);
});
