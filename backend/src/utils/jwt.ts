import jwt from "jsonwebtoken";

const SESSION_EXPIRY = "24h";
// The Google login redirects the browser to the SPA with a token in the URL.
// URLs end up in history, logs and Referer headers, so that token must be
// short-lived and useless as a session.
const EXCHANGE_EXPIRY = "60s";
const EXCHANGE_PURPOSE = "oauth-exchange";

type TokenPayload = { id: number; purpose?: string };

// Read lazily so the secret is looked up when used, not when the module loads
// (which depends on import order relative to dotenv).
const getSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not defined");
  return secret;
};

const verify = (token: string): TokenPayload =>
  jwt.verify(token, getSecret(), { algorithms: ["HS256"] }) as TokenPayload;

// Session token: stored in the HTTP-only cookie.
export const signToken = (userId: number): string =>
  jwt.sign({ id: userId }, getSecret(), { expiresIn: SESSION_EXPIRY });

// Only accepts session tokens. Tokens that carry a purpose (such as the
// exchange token) are rejected, so they can never be used as a cookie.
export const verifyToken = (token: string): { id: number } => {
  const payload = verify(token);
  if (payload.purpose) throw new Error("Not a session token");
  return { id: payload.id };
};

// One-time-use style token for the OAuth redirect: valid for 60 seconds and
// only accepted by /api/auth/exchange.
export const signExchangeToken = (userId: number): string =>
  jwt.sign({ id: userId, purpose: EXCHANGE_PURPOSE }, getSecret(), {
    expiresIn: EXCHANGE_EXPIRY,
  });

export const verifyExchangeToken = (token: string): { id: number } => {
  const payload = verify(token);
  if (payload.purpose !== EXCHANGE_PURPOSE) {
    throw new Error("Not an exchange token");
  }
  return { id: payload.id };
};
