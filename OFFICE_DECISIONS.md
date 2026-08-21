# Office/hardware decisions — not code

Everything in `ops/` (backups, TLS) is built to work once these are decided, but none of them are things code can decide. This is the checklist to take to whoever manages the office's physical setup and network — could be Dante, could be someone else, but it's not an engineering task.

1. **Where do backups physically live?** `ops/backup.sh` writes to `BACKUP_DIR`, which defaults to the same disk as the live database — meaning a disk failure destroys the system and every backup at once. Needs a second, physically separate location: a NAS, an external drive, another machine, anything not sharing a disk (or ideally a building) with the server. Once chosen, it's one environment variable.

2. **Is the uploads folder on redundant storage?** Same risk, different data — `backend/var/uploads` holds every original file anyone's ever uploaded. Being included in the backup script means it's recoverable after a mistake, but a RAID array or NAS-backed disk would mean it survives a live failure without needing a restore at all. Worth asking whatever the office already has before buying anything.

3. **What server is this actually running on?** Everything in this project assumes one on-prem machine running Postgres, the backend, Caddy, and (optionally) OpenSearch at once. Confirm that machine exists, has the memory to spare (OpenSearch alone wants ~1GB+), and has someone responsible for it — patching, disk space, uptime.

4. **How do office machines resolve the server's hostname?** TLS setup (`ops/Caddyfile`) needs every machine to reach the server at a consistent hostname, not just its IP. If the office has real internal DNS, that's the clean answer — otherwise it's a `hosts` file entry per machine, which works fine for a small office but is one more thing to maintain by hand as machines change.

5. **Who can access the server, physically and remotely?** This is the one machine holding real accounting/business records. Worth a plain answer to "who has a login, and how is that login itself secured" before this goes live — not a step here for me to fill in.

6. **Power.** A server with no UPS goes down the instant the office does — worth knowing whether that's already covered before this becomes something people depend on daily.

7. **Who holds the production secrets?** `JWT_SECRET`, database passwords, and the seed-user passwords currently sit in a local `.env` file. In a real deployment, someone needs to own who can read or change that file, and what happens if it needs rotating. Small decision, easy to skip, expensive to have skipped later.

None of these block the engineering work already done — `ops/backup.sh`, `ops/restore.sh`, and `ops/Caddyfile` all work the moment these are answered. They just can't be answered by writing more code.
