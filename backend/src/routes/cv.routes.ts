import { del, put } from "@vercel/blob";
import { NextFunction, Request, Response, Router } from "express";
import multer from "multer";

import { isAuthenticated } from "../middleware/authMiddleware.js";
import {
  createCV,
  CVLimitError,
  deleteCV,
  getCVCount,
  getCVsByUser,
  updateCV,
} from "../services/cv.service.js";
import {
  CreateCVPayload,
  MAX_CVS,
  UpdateCVPayload,
} from "../types/cv.types.js";
import { User } from "../types/user.types.js";
import { parseBoolean } from "../utils/parseBoolean.js";
import { parseId } from "../utils/parseId.js";
import { buildCvBlobPath, isPdfBuffer } from "../utils/pdf.js";

const router = Router();

const MAX_CV_SIZE_BYTES = 1 * 1024 * 1024; // 1MB
const PDF_ONLY_MESSAGE = "Only PDF files are allowed";

const upload = multer({
  storage: multer.memoryStorage(), // keep file in memory as a Buffer
  limits: { fileSize: MAX_CV_SIZE_BYTES },
  fileFilter: (_, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error(PDF_ONLY_MESSAGE));
    }
  },
});

// Wraps multer so upload problems become clear 400 JSON responses instead of
// falling through to Express's default 500 HTML error page.
const uploadCvFile = (req: Request, res: Response, next: NextFunction) => {
  upload.single("file")(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }

    if (err instanceof multer.MulterError) {
      res.status(400).json({
        error:
          err.code === "LIMIT_FILE_SIZE"
            ? "The PDF must be smaller than 1 MB"
            : "Invalid file upload",
      });
      return;
    }

    if (err instanceof Error && err.message === PDF_ONLY_MESSAGE) {
      res.status(400).json({ error: PDF_ONLY_MESSAGE });
      return;
    }

    next(err);
  });
};

router.use(isAuthenticated);

router.get("/", async (req: Request, res: Response): Promise<void> => {
  const user = req.user as User;
  try {
    const cvs = await getCVsByUser(user.id);
    res.json({ cvs });
  } catch {
    res.status(500).json({ error: "Failed to fetch CVs" });
  }
});

router.post(
  "/",
  uploadCvFile, // "file" matches the FormData field name on the frontend
  async (req: Request, res: Response): Promise<void> => {
    const user = req.user as User;
    const { name, version_label, notes, is_default } =
      req.body as CreateCVPayload;

    if (!name?.trim()) {
      res.status(400).json({ error: "Name is required" });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "A PDF file is required" });
      return;
    }
    if (!isPdfBuffer(req.file.buffer)) {
      res.status(400).json({ error: PDF_ONLY_MESSAGE });
      return;
    }

    try {
      // Cheap early exit so we do not upload a file we are about to reject.
      // createCV re-checks this authoritatively inside a transaction.
      if ((await getCVCount(user.id)) >= MAX_CVS) {
        throw new CVLimitError();
      }

      const blob = await put(
        buildCvBlobPath(req.file.originalname),
        req.file.buffer,
        {
          access: "public", // must match your Vercel Blob store access setting
          token: process.env.BLOB_READ_WRITE_TOKEN,
          contentType: "application/pdf",
          addRandomSuffix: false, // the path already contains a random UUID
        },
      );

      try {
        const cv = await createCV(user.id, {
          name: name.trim(),
          version_label: version_label?.trim() || null,
          notes: notes?.trim() || null,
          is_default: parseBoolean(is_default),
          file_url: blob.url,
        });

        res.status(201).json({ cv });
      } catch (err) {
        // The database rejected the CV (for example the limit was hit by a
        // parallel request): don't leave the uploaded file behind.
        await del(blob.url, { token: process.env.BLOB_READ_WRITE_TOKEN }).catch(
          () => undefined,
        );
        throw err;
      }
    } catch (err) {
      if (err instanceof CVLimitError) {
        res.status(400).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: "Failed to upload CV" });
    }
  },
);

router.put("/:id", async (req: Request, res: Response): Promise<void> => {
  const user = req.user as User;
  const id = parseId(req.params.id as string);
  if (!id) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const { name, version_label, notes, is_default } =
    req.body as UpdateCVPayload;

  try {
    const cv = await updateCV(id, user.id, {
      name,
      version_label,
      notes,
      is_default,
    });
    if (!cv) {
      res.status(404).json({ error: "CV not found" });
      return;
    }
    res.json({ cv });
  } catch {
    res.status(500).json({ error: "Failed to update CV" });
  }
});

router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  const user = req.user as User;
  const id = parseId(req.params.id as string);
  if (!id) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  try {
    const { deleted, fileUrl } = await deleteCV(id, user.id);
    if (!deleted) {
      res.status(404).json({ error: "CV not found" });
      return;
    }
    if (fileUrl) {
      await del(fileUrl, { token: process.env.BLOB_READ_WRITE_TOKEN });
    }
    res.json({ message: "CV deleted" });
  } catch {
    res.status(500).json({ error: "Failed to delete CV" });
  }
});

export default router;
