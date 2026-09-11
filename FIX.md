# Fix: Caddy TLS trust breaking repeatedly on the Windows host

## Problem

`ops/Caddyfile.windows` used Caddy's `tls internal` directive, which tells
Caddy to generate and manage its own self-signed CA automatically. That CA
regenerated itself at least twice in the field:

- **2026-09-05**: when the Caddy service moved from running in an
  interactive session to running as a Windows SYSTEM service (via NSSM),
  because SYSTEM's profile is a different storage path than the interactive
  profile Caddy used before.
- **2026-09-10**: regenerated again for a reason not fully root-caused
  (coincides with unrelated maintenance activity that evening).

Each time, every office PC that had previously trusted the old CA started
failing TLS validation against `https://erp.shankara.local` ("not secure" /
connection blocked), and someone had to manually re-extract the new CA from
Caddy's storage and redistribute it to every PC again.

## Fix

Stopped letting Caddy auto-manage the CA. `ops/Caddyfile.windows` now points
at a fixed certificate/key pair instead of `tls internal`:

```
tls E:/shankara-erp/ops/windows/erp-shankara-local.crt E:/shankara-erp/ops/windows/erp-shankara-local.key
```

These files are:

- A self-managed root CA (`CN=Shankara ERP Internal Root CA`, RSA-4096,
  10-year validity) installed once into the host's `LocalMachine\Root`
  trust store.
- A leaf certificate for `erp.shankara.local` (RSA-2048, 5-year validity)
  signed by that root CA.

Both were generated with Windows' built-in `New-SelfSignedCertificate` (no
third-party tooling). The leaf's private key is exported as a plain PEM
(PKCS#1) file — this Caddy build (v2.11.4) has no PKCS12/PFX support
compiled in, and this specific host's .NET Framework can't export CNG-backed
key parameters, so the leaf cert had to be created with the legacy
`Microsoft Enhanced RSA and AES Cryptographic Provider` CSP to get an
exportable key at all.

Because Caddy now just reads a fixed cert/key from disk instead of managing
its own CA, it has nothing left to regenerate. A service restart, a reboot,
or Docker cycling no longer affects trust. The only future maintenance need
is renewing the leaf cert before 2031, or replacing it earlier if this host
is ever renamed/re-IP'd in a way that needs a new SAN.

## Files changed

- `ops/Caddyfile.windows` — `tls internal` → fixed cert/key pair.
- `ops/windows/shankara-root-ca.crt` (new, committed — public, no secret
  material) — the root CA every PC needs to trust once.
- `ops/windows/erp-shankara-local.crt` (new, committed — public leaf cert).
- `ops/windows/erp-shankara-local.key` (new, **not committed** — private
  key, added to `.gitignore` alongside `*.pfx`).
- `.gitignore` — added `ops/windows/*.key` and `ops/windows/*.pfx`.

## Redistribution

The onboarding package for other PCs (`setup-shankara-erp-access.ps1`, kept
on the host's Desktop at `Desktop\redist\` for handing to IT staff — not
currently committed to this repo) was updated: previously it required
copying both `caddy-root.crt` and `caddy-intermediate.crt` and installing
them into two different trust stores (`Root` + `CA`) because Caddy's
auto-managed CA was a root+intermediate pair. Now it only needs the one
`shankara-root-ca.crt`, installed into `LocalMachine\Root`.

Any PC that trusted the old Caddy-managed CA (root or root+intermediate)
needs `shankara-root-ca.crt` installed and the stale entries can be left in
place (harmless) or removed. Re-run `setup-shankara-erp-access.ps1` with the
new cert to update.

## Known open items / next steps

- **DHCP reservation for this host's MAC address — top priority.** No
  reservation exists as of 2026-09-11; the LAN IP has already drifted three
  times (`192.168.4.59` → `.157` → `.181`) without one. This doesn't break
  cert trust anymore (see above), but it does break every PC's hosts-file
  entry for `erp.shankara.local` whenever it happens, until
  `setup-shankara-erp-access.ps1` is re-run with the current IP. Needs the
  office router admin — not doable from this host alone. Owner: Grok
  (day-to-day handler as of 2026-09-05) with the user; Claude's role here is
  periodic audit, next one on request.
- Off-box backups and a restore drill are still outstanding (see prior
  hosting-status notes, not repeated here).
