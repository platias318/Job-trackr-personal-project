// Multipart form fields always arrive as strings ("true" / "false"), while JSON
// bodies carry real booleans. Accept both, and treat anything else as false.
export const parseBoolean = (value: unknown): boolean =>
  value === true || value === "true";
