import type { Application } from "@/types/application.types";
import type { CV } from "@/types/cv.types";

let nextId = 1;

// A complete Application with sensible defaults; override only what a test cares about.
export const makeApplication = (
  overrides: Partial<Application> = {},
): Application => {
  const id = overrides.id ?? nextId++;
  return {
    id,
    user_id: 1,
    company_name: `Company ${id}`,
    job_title: "Frontend Developer",
    status: "Applied",
    date_applied: "2026-11-01T00:00:00.000Z",
    job_link: null,
    linkedin_link: null,
    notes: null,
    follow_up_date: null,
    created_at: "2026-11-01T09:00:00.000Z",
    updated_at: "2026-11-01T09:00:00.000Z",
    ...overrides,
  };
};

export const makeCV = (overrides: Partial<CV> = {}): CV => {
  const id = overrides.id ?? nextId++;
  return {
    id,
    user_id: 1,
    name: `CV ${id}`,
    version_label: null,
    notes: null,
    file_url: `https://blob.test/cvs/${id}.pdf`,
    is_default: false,
    created_at: "2026-11-01T09:00:00.000Z",
    updated_at: "2026-11-01T09:00:00.000Z",
    ...overrides,
  };
};
