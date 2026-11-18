import { Request, Response, Router } from "express";

import { pool } from "../config/db.js";
import passport from "../config/passport.js";
import { isAuthenticated } from "../middleware/authMiddleware.js";
import { User } from "../types/user.types.js";
import { sendVerificationCode } from "../utils/email.js";
import {
  signExchangeToken,
  signToken,
  verifyExchangeToken,
} from "../utils/jwt.js";
import {
  codesMatch,
  generateCode,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_TTL_MINUTES,
} from "../utils/otp.js";
import { normalizeEmail } from "../utils/validateEmail.js";

const router = Router();

// This endpoint redirects to google authentication page, this gets called when sign in with google button is called
router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
  }),
);

router.get(
  "/google/secrets",
  passport.authenticate("google", {
    failureRedirect: `${process.env.FRONTEND_URL}/?error=auth_failed`,
    session: false, // We don't want session cookies
  }),
  // Successful redirect
  (req: Request, res: Response) => {
    const user = req.user as User;
    // Short-lived, exchange-only token (not a session token)
    const code = signExchangeToken(user.id);

    res.redirect(`${process.env.FRONTEND_URL}/auth/callback?code=${code}`);
  },
);

// This endpoint sends a verification code to the user's mail when signing in via email
router.post(
  "/email/send-code",
  async (req: Request, res: Response): Promise<void> => {
    const email = normalizeEmail(req.body?.email);

    if (!email) {
      res.status(400).json({ error: "A valid email is required" });
      return;
    }

    try {
      const code = generateCode();

      // One active code per email. The upsert only replaces an existing code
      // once the resend cooldown has passed (a code is "created" at
      // expires_at - TTL), so this single statement both issues the code and
      // rate-limits how often an address can be emailed.
      const cooldownWindowSeconds =
        OTP_TTL_MINUTES * 60 - OTP_RESEND_COOLDOWN_SECONDS;

      const { rowCount } = await pool.query(
        `INSERT INTO verification_codes (email, code, expires_at, attempts)
         VALUES ($1, $2, NOW() + make_interval(mins => $3::int), 0)
         ON CONFLICT (email) DO UPDATE
           SET code = EXCLUDED.code,
               expires_at = EXCLUDED.expires_at,
               attempts = 0
           WHERE verification_codes.expires_at
                 <= NOW() + make_interval(secs => $4::int)`,
        [email, code, OTP_TTL_MINUTES, cooldownWindowSeconds],
      );

      if (!rowCount) {
        res.set("Retry-After", String(OTP_RESEND_COOLDOWN_SECONDS));
        res.status(429).json({
          error: "Please wait a minute before requesting another code",
        });
        return;
      }

      try {
        await sendVerificationCode(email, code);
      } catch (err) {
        // The email never went out: free the slot so the user can retry
        // immediately instead of waiting out the cooldown.
        await pool.query(
          "DELETE FROM verification_codes WHERE email = $1 AND code = $2",
          [email, code],
        );
        throw err;
      }

      res.json({ message: "Code sent" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to send code" });
    }
  },
);

router.post(
  "/email/verify-code",
  async (req: Request, res: Response): Promise<void> => {
    const email = normalizeEmail(req.body?.email);
    const code =
      typeof req.body?.code === "string" ? req.body.code.trim() : "";

    if (!email || !/^\d{6}$/.test(code)) {
      res.status(400).json({ error: "Email and a 6-digit code are required" });
      return;
    }

    try {
      // Every guess consumes an attempt *before* the code is compared, in a
      // single atomic UPDATE. Parallel requests therefore cannot get more than
      // OTP_MAX_ATTEMPTS guesses, and once the attempts are used up (or the
      // code expired) no row comes back at all.
      const { rows } = await pool.query(
        `UPDATE verification_codes
            SET attempts = attempts + 1
          WHERE email = $1 AND expires_at > NOW() AND attempts < $2
          RETURNING code`,
        [email, OTP_MAX_ATTEMPTS],
      );

      if (!rows[0] || !codesMatch(rows[0].code, code)) {
        res.status(401).json({ error: "Invalid or expired code" });
        return;
      }

      await pool.query("DELETE FROM verification_codes WHERE email = $1", [
        email,
      ]);

      // LOWER() so accounts created before emails were normalised still match.
      const existingUser = await pool.query(
        "SELECT * FROM users WHERE LOWER(email) = $1",
        [email],
      );

      let user = existingUser.rows[0];

      if (!user) {
        const newUser = await pool.query(
          "INSERT INTO users (email, name, email_verified) VALUES ($1, $2, TRUE) RETURNING *",
          [email, email.split("@")[0]],
        );
        user = newUser.rows[0];
      } else if (!user.email_verified) {
        await pool.query(
          "UPDATE users SET email_verified = TRUE WHERE id = $1",
          [user.id],
        );
      }

      const token = signToken(user.id);

      res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        maxAge: 24 * 60 * 60 * 1000,
      });

      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Something went wrong" });
    }
  },
);

// This is used to exchange cookies with frontend in order to keep the user signed in (vercel restricts cookies from redirections from backend to frontend)
router.get("/exchange", async (req: Request, res: Response): Promise<void> => {
  const code = req.query.code as string;

  if (!code) {
    res.status(400).json({ error: "No code provided" });
    return;
  }

  try {
    const payload = verifyExchangeToken(code);

    const { rows } = await pool.query(
      "SELECT id, email, name FROM users WHERE id = $1",
      [payload.id],
    );

    if (!rows[0]) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    // Now set the long-lived cookie in a direct API response
    const token = signToken(rows[0].id);

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 24 * 60 * 60 * 1000,
    });

    res.json({ ok: true });
  } catch {
    res.status(401).json({ error: "Invalid or expired code" });
  }
});

// When this endpoint gets hit, it checks if we are authenticated with the isAuthenticated middleware func
router.get("/me", isAuthenticated, (req: Request, res: Response) => {
  const user = req.user as User;

  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
    },
  });
});

router.post("/logout", (req: Request, res: Response) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  });

  res.json({ message: "Logged out successfully" });
});

export default router;
