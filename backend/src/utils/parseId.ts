const MAX_INT4 = 2_147_483_647; // Postgres INTEGER ceiling

// Accepts only plain positive integers ("12"), not "12abc", "1e3", "-4" or
// ids too large for the database column.
export const parseId = (idParam: string): number | null => {
  if (!/^[1-9]\d*$/.test(idParam)) return null;

  const id = Number(idParam);
  return Number.isSafeInteger(id) && id <= MAX_INT4 ? id : null;
};
