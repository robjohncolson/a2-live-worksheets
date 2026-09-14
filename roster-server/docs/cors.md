# CORS and deployment

The server currently uses `app.use(cors())`, allowing browser origins broadly.
Authentication and teacher authorization still apply to protected routes.

When the Algebra 2 deployment origins are known, an explicit allowlist can cover
the course site and any retained worksheet or quiz clients. Verify sign-in,
Do Now, grades, flashcard commits, and teacher tools from each deployed origin
after changing it. The old AP Stats allowlist patch targeted removed clients
and an obsolete app factory, so it is no longer applicable.
