// types/globals.d.ts — TYPES ONLY (never shipped, never built): the custom
// window.* globals the allowlisted browser modules read/write. Kept minimal —
// only what tsc needs to check the §2 allowlist; page-level globals outside the
// allowlist stay undeclared on purpose.

interface Window {
  ROSTER_SERVICE_URL?: string;
  RAILWAY_ROSTER_URL?: string;
  rosterClient?: {
    token?: () => string | null;
    studentId?: () => string | null;
    current?: () => { username?: string; realName?: string; studentId?: string } | null;
  };
  OfflineQueue?: {
    enqueue?: (rec: unknown) => unknown;
    isOffline?: () => boolean;
    drain?: (send: (rec: unknown) => unknown) => Promise<{ sent: number; failed: number }>;
  };
  gradebookClient?: unknown;
  /** Worksheet view-as: read-only — record() must refuse (reason 'read-only'). */
  __WS_READ_ONLY__?: boolean;
  /** Teacher view-as: fetchPrior reads THIS student's rows instead of the signed-in user's. */
  __VIEW_AS_STUDENT_ID__?: string;
}
