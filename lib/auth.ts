import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { appConfig } from "./config";

const COOKIE_NAME = "ai_rss_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

function sign(value: string) {
  return createHmac("sha256", appConfig.sessionSecret).update(value).digest("hex");
}

function constantTimeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function verifyPassword(password: string) {
  return constantTimeEqual(password, appConfig.adminPassword);
}

export function createSessionValue() {
  const payload = JSON.stringify({ role: "admin", exp: Date.now() + MAX_AGE_SECONDS * 1000 });
  const encoded = Buffer.from(payload).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function isValidSession(value?: string) {
  if (!value) return false;
  const [encoded, signature] = value.split(".");
  if (!encoded || !signature || !constantTimeEqual(signature, sign(encoded))) return false;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as { exp?: number };
    return typeof payload.exp === "number" && payload.exp > Date.now();
  } catch {
    return false;
  }
}

export function isAuthenticated() {
  return isValidSession(cookies().get(COOKIE_NAME)?.value);
}

export function requireAuth() {
  if (!isAuthenticated()) {
    throw new Error("Unauthorized");
  }
}

export function isRequestAuthenticated(request: NextRequest) {
  return isValidSession(request.cookies.get(COOKIE_NAME)?.value);
}

export function setSessionCookie(response: NextResponse) {
  response.cookies.set(COOKIE_NAME, createSessionValue(), {
    httpOnly: true,
    sameSite: "lax",
    secure: appConfig.cookieSecure,
    path: "/",
    maxAge: MAX_AGE_SECONDS
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: appConfig.cookieSecure,
    path: "/",
    maxAge: 0
  });
}
