import test from "node:test";
import assert from "node:assert/strict";
import { LINK_SECONDS, signLink, verifyLink } from "../lib/server/sign.ts";

const secret = "a-long-random-secret-for-tests-only";
const address = "https://example.com/images/hero.jpg";
const now = Date.UTC(2026, 10, 11, 12, 0, 0);

test("a link signed by a scan opens that picture, and only that one", async () => {
  const token = await signLink(secret, address, now);
  assert.equal(await verifyLink(secret, address, token, now + 1000), true);
  assert.equal(await verifyLink(secret, "https://example.com/images/other.jpg", token, now), false);
  assert.equal(await verifyLink("another-secret-of-similar-length", address, token, now), false);
});

test("links expire, and forged or missing tokens are refused", async () => {
  const token = await signLink(secret, address, now);
  assert.equal(await verifyLink(secret, address, token, now + (LINK_SECONDS + 5) * 1000), false);
  const [expires, signature] = token.split(".");
  assert.equal(await verifyLink(secret, address, `${Number(expires) + 600}.${signature}`, now), false);
  assert.equal(await verifyLink(secret, address, `${expires}.${signature.slice(0, -2)}AA`, now), false);
  assert.equal(await verifyLink(secret, address, null, now), false);
  assert.equal(await verifyLink(secret, address, "garbage", now), false);
});
