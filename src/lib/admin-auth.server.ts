import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";

const MASTER_EMAIL = (process.env["ADMIN_EMAIL"] || "drax@draxsistemas.com.br").trim().toLowerCase();
const MASTER_PASSWORD = process.env["ADMIN_PASSWORD"] || "draxsistemas";
const COOKIE = "gabrielle_admin";
const MAX_AGE_SEC = 60 * 60 * 24 * 30;

function signingKey() {
  return process.env["ADMIN_SESSION_SECRET"] || MASTER_PASSWORD;
}

function sign(payload: string) {
  return createHmac("sha256", signingKey()).update(payload).digest("base64url");
}

function same(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    timingSafeEqual(Buffer.alloc(32), Buffer.alloc(32));
    return false;
  }
  return timingSafeEqual(left, right);
}

export function credentialsMatch(email: string, password: string) {
  return same(email.trim().toLowerCase(), MASTER_EMAIL) && same(password, MASTER_PASSWORD);
}

export function setMasterCookie() {
  const issued = String(Date.now());
  const nonce = randomBytes(16).toString("base64url");
  const payload = `${issued}.${nonce}`;
  setCookie(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: true,
    maxAge: MAX_AGE_SEC,
  });
}

export function hasMasterCookie() {
  const raw = getCookie(COOKIE);
  if (!raw) return false;
  const parts = raw.split(".");
  if (parts.length !== 3) return false;
  const [issued, nonce, mac] = parts;
  const expected = sign(`${issued}.${nonce}`);
  if (!same(mac, expected)) return false;
  const ts = Number(issued);
  if (!Number.isFinite(ts) || Date.now() - ts > MAX_AGE_SEC * 1000) return false;
  return true;
}

export function assertMasterCookie() {
  if (!hasMasterCookie()) throw new Error("Acesso restrito");
}

export function clearMasterCookie() {
  deleteCookie(COOKIE, { path: "/" });
}
