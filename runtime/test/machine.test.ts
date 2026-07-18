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

// `A` は「このオペレーションをハンドラが何の型で resume するか」の表明。
// TS からは検証できない信頼点(PS 側では型システムが保証する)。
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

test("abort: 継続を破棄して即座に値を返す", () => {
  const result = run(
    Handle(
      id,
      { fail: (_p, _k) => Pure("aborted") },
      Bind(act("fail"), (_x) => Pure("should not reach")),
    ),
  );
  assert.equal(result, "aborted");
});

test("return 節(pure)を通した deep semantics", () => {
  const result = run(
    Handle(
      (v: number) => Pure(v * 10),
      { ask: (_p, k) => k(1) },
      act<number>("ask"),
    ),
  );
  assert.equal(result, 10);
});

test("resume 後の続き: k の結果は return 節を通った処理済みの値", () => {
  const result = run(
    Handle(
      (v: number) => Pure(v * 10),
      { ask: (_p, k) => Bind(k(1), (r) => Pure((r as number) + 100)) },
      act<number>("ask"),
    ),
  );
  assert.equal(result, 110);
});

test("ネストしたハンドラと効果の転送", () => {
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

test("状態エフェクト (get/put)", () => {
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

test("マルチショット継続 (k を2回呼ぶ)", () => {
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

test("スタック安全性 (200k binds)", () => {
  let c: Computation<number> = Pure(0);
  for (let i = 0; i < 200_000; i++) c = Bind(c, (x) => Pure(x + 1));
  assert.equal(run(c), 200_000);
});

test("未処理エフェクトはエラー", () => {
  assert.throws(() => run(act("nope")), /Unhandled effect operation 'nope'/);
});
