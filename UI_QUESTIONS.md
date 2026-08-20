# UI phase — questions for Claude (and whoever refines)

**Not a work order.** Backend/architecture of Phases 1–3 is in the repo. The current React shell is a placeholder. Do not treat highlight-on-yellow as the product look.

**Local run:** `docker compose up -d`, `cd backend && npm run start:dev`, `cd frontend && npm run dev` → http://127.0.0.1:5173/  
Seed emails: `finance@shankara.local` / `steward@shankara.local` / `branch@shankara.local`  
Passwords: `SEED_*_PASSWORD` in `backend/.env` (local: `finance_dev_pass`, `steward_dev_pass`, `branch_dev_pass`).

**Must not break:**
- One search box (no Parties/Items pills, no AG Grid, no Create Voucher)
- JWT roles: steward upload+publish; finance search/retrieve; branch `company_id` in SQL
- As-of from `GET /api/meta/as-of`, Asia/Kolkata
- Voucher pane: lines + `source.sha256`
- Held batches invisible to finance/branch
- Tally remains book of record (read-only)

---

## Questions (answer these, then refine with Grok)

1. **Primary user of the first screen?** Finance search-only, or steward upload-first?
2. **Look:** brand colors / font / screenshot / existing Shankara site? Or “dense Tally back-office” vs “clean SaaS”?
3. **Keep vs drop vs add:** date range, vch type filter, saved queries, keyboard `/` to focus, match highlight, upload dropzone, anything else?
4. **Viewport:** desktop-only for now, or must work at 1366px / tablet?
5. **Tone:** listed building-materials finance team; English UI is fine unless you want Hindi labels too.

When you have answers (and any mockups), bring them back for implementation/refinement. Do not invent a visual system without those.
