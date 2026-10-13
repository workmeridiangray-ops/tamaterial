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
