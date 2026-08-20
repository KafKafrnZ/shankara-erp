S21_STATUS=COMPLETE

date: 2026-08-20
Implemented in frontend (human). No browser MCP this pass — grep + `npm run build`.

| # | Gate | Evidence |
|---|---|---|
| 1 | One search box on Search page | `frontend/src/App.tsx` Search form: single `input` `aria-label="Search vouchers"`. Login/upload inputs are not search. |
| 2 | No Parties/Items pills, no AG Grid, no Create Voucher | `git grep` Parties / Items / AG Grid / Create Voucher under `frontend/` empty |
| 3 | Match highlight | `highlightText` wraps query matches in `<mark className="search-hl">` on vchNo, partyName, totalAmount. CSS in `index.css`. |
| 4 | `cd frontend && npm run build` | exit 0, vite built `dist/assets/index-DYOwglc8.js` |
| 5 | `/` still focuses search | existing `keydown` handler on `/` unchanged |

Human should click Search on `:5173`, type `INV/SR/1`, confirm yellow mark on the vch cell.
