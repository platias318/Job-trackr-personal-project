const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;

// Trims and lower-cases an email so "A@x.com" and "a@x.com" are one account.
// Returns null when the value is not a plausible email address.
export const normalizeEmail = (value: unknown): string | null => {
  if (typeof value !== "string") return null;

  const email = value.trim().toLowerCase();
  if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
    return null;
  }

  return email;
};
