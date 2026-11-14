import {
  lockUserResource,
  pool,
  USER_LOCK,
  withTransaction,
} from "../config/db.js";
import {
  CreateCVPayload,
  CV,
  MAX_CVS,
  UpdateCVPayload,
} from "../types/cv.types.js";

export class CVLimitError extends Error {
  constructor() {
    super(`You have reached the maximum of ${MAX_CVS} CVs`);
    this.name = "CVLimitError";
  }
}

export const getCVsByUser = async (userId: number): Promise<CV[]> => {
  const { rows } = await pool.query(
    "SELECT * FROM cvs WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC",
    [userId],
  );
  return rows;
};

export const getCVCount = async (userId: number): Promise<number> => {
  const { rows } = await pool.query(
    "SELECT COUNT(*)::int AS count FROM cvs WHERE user_id = $1",
    [userId],
  );
  return rows[0].count;
};

// The limit check, the "only one default" bookkeeping and the insert run in
// one transaction under a per-user lock, so parallel uploads cannot exceed
// MAX_CVS and a failed insert cannot leave the user without their default.
export const createCV = (userId: number, data: CreateCVPayload): Promise<CV> =>
  withTransaction(async (client) => {
    await lockUserResource(client, USER_LOCK.cvs, userId);

    const { rows: counted } = await client.query(
      "SELECT COUNT(*)::int AS count FROM cvs WHERE user_id = $1",
      [userId],
    );
    if (counted[0].count >= MAX_CVS) {
      throw new CVLimitError();
    }

    if (data.is_default) {
      await client.query("UPDATE cvs SET is_default = FALSE WHERE user_id = $1", [
        userId,
      ]);
    }

    const { rows } = await client.query(
      `INSERT INTO cvs (user_id, name, version_label, notes, is_default, file_url)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        userId,
        data.name,
        data.version_label,
        data.notes,
        data.is_default,
        data.file_url,
      ],
    );
    return rows[0];
  });

// Confirms the CV exists and belongs to the user *before* touching any other
// row. Previously a PUT for a missing id still cleared the user's real default.
export const updateCV = (
  id: number,
  userId: number,
  data: UpdateCVPayload,
): Promise<CV | null> =>
  withTransaction(async (client) => {
    await lockUserResource(client, USER_LOCK.cvs, userId);

    const { rows: owned } = await client.query(
      "SELECT id FROM cvs WHERE id = $1 AND user_id = $2 FOR UPDATE",
      [id, userId],
    );
    if (!owned[0]) return null;

    if (data.is_default) {
      await client.query(
        "UPDATE cvs SET is_default = FALSE WHERE user_id = $1 AND id <> $2",
        [userId, id],
      );
    }

    const { rows } = await client.query(
      `UPDATE cvs
       SET name          = COALESCE($1, name),
           version_label = COALESCE($2, version_label),
           notes         = COALESCE($3, notes),
           is_default    = COALESCE($4, is_default),
           updated_at    = NOW()
       WHERE id = $5 AND user_id = $6
       RETURNING *`,
      [data.name, data.version_label, data.notes, data.is_default, id, userId],
    );
    return rows[0] ?? null;
  });

export const deleteCV = async (
  id: number,
  userId: number,
): Promise<{ deleted: boolean; fileUrl: string | null }> => {
  const { rows } = await pool.query(
    "DELETE FROM cvs WHERE id = $1 AND user_id = $2 RETURNING file_url",
    [id, userId],
  );
  if (!rows[0]) return { deleted: false, fileUrl: null };
  return { deleted: true, fileUrl: rows[0].file_url };
};
