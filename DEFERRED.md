# Deferred / skipped for now

Running list of things we've deliberately not built yet, so nothing gets lost. Pull an item
off this list when it's actually built (and say so in the commit message).

- **Admin Mobile+OTP sign-in** (master spec, Admin module). Needs a real SMS provider account
  (Twilio, MSG91, etc.) — none connected, and it's a recurring cost + a provider choice that's
  annoying to switch later. Current sign-in stays PIN + Google OAuth. Revisit once a provider
  is chosen, or do an email-OTP version instead if that's preferred.
- **Fully data-driven Roles table** (master spec, Admin module access matrix). Per-module
  access by role is already enforced server-side (every route/collection checks role), matching
  the spec's matrix in substance, but it's hardcoded in server.js rather than an editable
  Users/Roles table an admin can change from the UI.
- **Rule 8, "Credit client: invoice + report sent together"** — currently every client, Credit
  or Advance, still needs an explicit "Mark as sent" step from Accounts after a report is
  approved (Advance correctly stays blocked until paid; Credit isn't blocked, but still needs that
  manual click). I tried auto-marking Credit reports as sent the moment they're approved and it
  broke two existing tests that explicitly expect "approved" and "sent" to stay separate stages
  regardless of billing terms — so that manual step looks intentional (a last review before a
  report leaves the building), not an oversight. Didn't want to silently remove a review step for
  real client-facing reports without you confirming that's what you want.
- **Billing screens 1–13 exact restructure** (master spec). Most already exist and work the
  same way (quotation, to-invoice, client master, payment history, record payment) — this is
  mostly renaming/reflow to match the spec's exact screen list, not new functionality.
- **GST certificate / PAN card file uploads** (client master).
- **Live GSTIN registry lookup** — state/PAN are decoded offline from the GSTIN string itself;
  client name/address still typed manually (no paid verification API connected).
- **`partStatus` not surfaced everywhere** — now shown per-part in the client master's project
  view (Billing 6b). Still not shown on the testing schedule or the to-invoice queue (those
  screens are inherently single-status views already, so lower priority).
- **Distinct cheque-clearing UI beyond the Payment History tab** — Mark cleared/bounced exists
  there now; no dedicated cheque-ledger screen.

Added after triaging an external "app flow audit" doc (generated from the exported spec/diagram,
not the real code — most of its list turned out to already be built: session expiry, the full
audit-log table, notifications, draft/returned report states, login lockout, overpayment
blocking, user disable/enable, work-order expiry badges, and per-job calibration-date capture are
all live and just weren't visible to whatever reviewed the exported docs). These five are the
genuine gaps it surfaced:
- **Credit notes** — no feature at all. Need to decide: adjust the original invoice, or issue a
  separate linked credit-note record against it (latter is cleaner for GST reporting).
- **Duplicate-client detection** — nothing checks for an existing client with the same name/GSTIN
  before a new one is created.
- **Forgot-PIN / self-service PIN recovery** — none. Only path today is an admin resetting the
  user from Admin → Users.
- **Multi-role users** — one role per user account; no secondary-role support (e.g. a tester who
  also reviews).
- **Equipment-level calibration-overdue alert** — calibration date is captured per test job with
  a computed 1-year valid-till, but nothing flags it as a standing dashboard alert the way
  work-order expiry does. Would need a `machines`/`equipment` master with its own calibration
  date, separate from the per-job field.
