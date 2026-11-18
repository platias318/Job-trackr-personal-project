import { randomUUID } from "crypto";

// Every PDF starts with "%PDF-". The mimetype sent by the browser is just a
// claim the client makes, so check the actual bytes too.
export const isPdfBuffer = (buffer: Buffer): boolean =>
  buffer.length >= 5 && buffer.subarray(0, 5).toString("latin1") === "%PDF-";

// Turns whatever the browser sent as a filename into something safe to put in
// a storage path: no directories, no control or bidi characters, no spaces.
export const sanitizeFileName = (originalName: string): string => {
  const base = originalName.split(/[\\/]/).pop() ?? "";
  const stem = base
    .replace(/\.pdf$/i, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 60);

  return `${stem || "cv"}.pdf`;
};

// cvs/<random uuid>/<safe-name>.pdf
// The UUID makes the URL unguessable and the readable file name keeps
// downloads friendly. It no longer includes the user id or a timestamp.
export const buildCvBlobPath = (originalName: string): string =>
  `cvs/${randomUUID()}/${sanitizeFileName(originalName)}`;
