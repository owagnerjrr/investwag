import { test } from "node:test";
import assert from "node:assert/strict";
import { dispatch } from "../../scripts/pilot-schedule.mjs";
import { signature } from "../pilot/routes.js";
test("scheduler without browser: bounded wake, signed useful POST, replay after uncertain response", async () => {
  let probes = 0,
    posts = 0;
  const secret = "test-only-".repeat(5),
    now = () => 1792060000000;
  const fetcher = async (url, o) => {
    if (url.pathname === "/health") {
      probes++;
      return new Response(
        JSON.stringify(probes === 1 ? {} : { mode: "simulation" }),
      );
    }
    posts++;
    assert.equal(
      o.headers["X-Pilot-Signature"],
      signature(secret, o.headers["X-Pilot-Timestamp"]),
    );
    if (posts === 1) throw Error("lost response");
    return new Response(JSON.stringify({ accounts: 1, orders: 0 }));
  };
  const r = await dispatch({
    base: "https://api.example.test",
    secret,
    fetcher,
    now,
    wait: async () => {},
  });
  assert.equal(r.accounts, 1);
  assert.equal(probes, 2);
  assert.equal(posts, 2);
  await assert.rejects(() =>
    dispatch({ base: "http://api.example.test", secret, fetcher }),
  );
  let attempts = 0;
  await assert.rejects(() =>
    dispatch({
      base: "https://api.example.test",
      secret,
      fetcher: async () => {
        attempts++;
        throw Error();
      },
      wait: async () => {},
    }),
  );
  assert.equal(attempts, 8);
});
