# Deploying QuestLearn for a real class

This is the shortest path from this repository to a URL your students can open,
plus the operations you actually need: backups, upgrades, and the three support
requests a class generates.

Target: one small Linux VPS (1–2 vCPU, 2 GB RAM, Ubuntu LTS) running PostgreSQL,
the Spring Boot jar under systemd, and nginx serving the built frontend over HTTPS.
No Docker required.

---

## 1. Create the server and point DNS at it

1. Create an Ubuntu LTS server with your SSH key.
2. Add an `A` record for `questlearn.example.com` (and `www` if you want it) pointing
   at the server's public IP.
3. Open only SSH, HTTP and HTTPS:

```bash
sudo apt-get update
sudo apt-get install -y openjdk-21-jre-headless nginx postgresql certbot python3-certbot-nginx git
sudo ufw allow OpenSSH && sudo ufw allow "Nginx Full" && sudo ufw --force enable
```

## 2. Create the database and application user

Give the app its own role rather than using `postgres`:

```bash
sudo -u postgres psql <<'SQL'
CREATE ROLE questlearn LOGIN PASSWORD 'replace-with-a-long-random-password';
CREATE DATABASE questlearn OWNER questlearn;
SQL
```

The schema is created by Flyway on first start; do not create tables by hand.

## 3. Lay out the application

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin questlearn
sudo mkdir -p /opt/questlearn/backend/logs /var/www/questlearn
sudo chown -R questlearn:questlearn /opt/questlearn
```

Build locally and copy the artifacts (or build on the server if it has a JDK):

```bash
# on your machine, from the repository root
cd questlearn-backend && mvn -B -DskipTests package
cd ../questlearn-frontend && npm ci && npm run build
```

```bash
# upload
scp questlearn-backend/target/questlearn-1.0.0.jar  you@server:/opt/questlearn/backend/questlearn.jar
scp -r questlearn-frontend/dist/*                  you@server:/var/www/questlearn/
```

## 4. Configure and start the backend

```bash
sudo install -m 600 -o questlearn -g questlearn deploy/app.env.example \
     /opt/questlearn/backend/app.env
sudo nano /opt/questlearn/backend/app.env      # fill in the values
sudo cp deploy/questlearn.service /etc/systemd/system/questlearn.service
sudo systemctl daemon-reload
sudo systemctl enable --now questlearn
sudo systemctl status questlearn --no-pager
curl -s localhost:8080/actuator/health          # {"status":"UP"}
```

`JWT_SECRET` and `CORS_ORIGINS` have **no defaults in the prod profile** — the app
refuses to start without them, which is intentional. Generate the secret with
`openssl rand -base64 48`.

### Voice viva and AI authoring (Groq)

The AI features are optional. Create a key at <https://console.groq.com/keys> and
add it to `app.env`; the app keeps working without it, but the viva and the AI
quest builder will answer `503` so students see a clear message instead of a
broken button.

```bash
GROQ_API_KEY=gsk_...                 # never commit this
GROQ_REASONING_MODEL=openai/gpt-oss-120b
GROQ_TRANSCRIPTION_MODEL=whisper-large-v3-turbo
AI_HOURLY_LIMIT=30                   # AI calls per account per rolling hour
```

Cost notes:

- One spoken viva attempt = one transcription + one chat completion. At the time of
  writing that is well under a cent per attempt on Groq's pricing. A typed answer
  (`POST /api/v1/modules/{id}/viva` with `{"answer": "..."}`) skips the
  transcription and costs less, which is why the typing fallback is worth telling
  students about on lab machines with no microphones.
- `AI_HOURLY_LIMIT` is the ceiling on how much one student can spend in an hour;
  lower it for large cohorts and keep the key out of the frontend entirely.
- The multipart ceiling (110 MB in prod) exists for instructor lesson videos.
  Viva recordings are capped separately at 8 MB in `VivaService`, and audio is
  streamed for grading and never written to disk.
- Nginx must allow the larger body: the shipped `deploy/nginx.conf` sets
  `client_max_body_size 120m`.
- Uploaded lesson videos are files under `MEDIA_VIDEO_DIR` (default
  `./uploads/videos`), not database rows. Back that directory up with PostgreSQL,
  and give it disk space.

The examiner derives its topics from each node's lesson content, so existing
courses need no authoring. An instructor can override it per node by adding a
`viva` block to the node's `content` JSONB:

```json
{
  "viva": {
    "bossName": "The Complexity Warden",
    "openingQuestion": "Defend why a hash map beats a sorted array here.",
    "topics": ["hash maps", "amortised cost"],
    "passThreshold": 70,
    "maxHp": 100
  }
}
```

## 5. Serve it with HTTPS

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/questlearn.conf
sudo nano /etc/nginx/sites-available/questlearn.conf   # set server_name
sudo ln -sf /etc/nginx/sites-available/questlearn.conf /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d questlearn.example.com --agree-tos -m you@example.com
```

Then set `CORS_ORIGINS=https://questlearn.example.com` in `app.env`, restart the
backend, and open the site.

## 6. Verify the deployment

```bash
curl -s https://questlearn.example.com/actuator/health        # UP
curl -s -o /dev/null -w '%{http_code}\n' https://questlearn.example.com/   # 200
curl -s -o /dev/null -w '%{http_code}\n' https://questlearn.example.com/api/v1/courses  # 401
```

Sign in as an admin, open **War room**, and confirm the account list loads — that
proves browser → nginx → Spring → PostgreSQL end to end.

---

## Backups (do this before students sign up)

```bash
sudo -u postgres mkdir -p /var/backups/questlearn
sudo crontab -e
```

```cron
15 2 * * * pg_dump -Fc questlearn | gzip > /var/backups/questlearn/questlearn-$(date +\%F).dump.gz
30 2 * * * find /var/backups/questlearn -name '*.dump.gz' -mtime +14 -delete
```

Restore into a scratch database to prove the backup works:

```bash
gunzip -c /var/backups/questlearn/questlearn-YYYY-MM-DD.dump.gz \
  | pg_restore -d questlearn_restore_test --clean --if-exists
```

Copy dumps off the machine (object storage or your laptop). A backup on the same
disk as the database is not a backup.

---

## Upgrading

```bash
sudo cp questlearn-1.0.1.jar /opt/questlearn/backend/questlearn.jar
sudo systemctl restart questlearn
```

Flyway applies any new `V<n>__*.sql` migrations at startup and Hibernate runs in
`validate` mode, so a mismatch fails the start instead of corrupting data. If it
fails, the old jar plus the previous dump gets you back.

**Never** re-enable `spring.jpa.hibernate.ddl-auto=update`.

---

## Support runbook

| Request | How to handle it |
|---|---|
| Student forgot their password | War room → **Reset** next to the account → read the one-time temporary password to them. The reset revokes every session that account had. They can change it themselves from the account menu once they are back in. |
| Student wants to retake a node | Nothing to do — completed nodes are replayable and keep the best score, with no extra XP. |
| A node shows as completed but the score is wrong | `DELETE /api/v1/admin/users/{userId}/modules/{moduleId}/progress` as admin; XP for that node is removed and the node becomes playable again. |
| New instructor needs an account | Give them `INSTRUCTOR_INVITE_CODE`, or create the account and change its role in War room. |
| Someone is brute-forcing logins | The account locks for 15 minutes after 5 failures and nginx limits `/auth/login` to 10 requests/minute per IP. Check `journalctl -u questlearn`. |

---

## Known limits of this deployment

These are deliberate trade-offs, not bugs:

- **No email is sent.** There is no mail transport, so password recovery is the
  admin-issued temporary password. Add an email provider before signup goes public.
- **Login throttling is in-memory.** Correct for one instance; a second instance
  needs a shared store or edge limiter.
- **No class/cohort model.** Every published course is visible to every student and
  the leaderboard is global.
- **24-hour tokens, no refresh, but they can be revoked.** A session expires a day
  after sign-in; the user signs in again. A password change or an admin reset bumps
  `users.token_version`, which invalidates every earlier token immediately.
- **The audit feed keeps the last 50 actions and has no export.** Role changes,
  password resets, progress resets and course moderation are recorded; retention is
  whatever is in `admin_audit_log`.
- **Files live on one server.** No object storage; uploads are not a feature yet.
  Viva recordings are not an exception: they are graded and discarded.
- **AI output is a draft.** Generated courses are always created unpublished and
  must be reviewed — like any model output, the content can be wrong.

## Pre-launch checklist

- [ ] `JWT_SECRET` is random and not the development default
- [ ] `CORS_ORIGINS` lists only your real origin
- [ ] `DB_USERNAME` is not `postgres`
- [ ] HTTPS works and HTTP redirects to it
- [ ] `/actuator/health` is reachable, `/v3/api-docs` is **not** (prod disables it)
- [ ] A restore from backup has been tested
- [ ] Admin account password changed from the demo value
- [ ] `INSTRUCTOR_INVITE_CODE` set, or instructor signup intentionally disabled
- [ ] `GROQ_API_KEY` set and `GET /api/v1/ai/status` reports `configured: true`
- [ ] One viva recorded from a phone, over HTTPS, and graded successfully
- [ ] `client_max_body_size` in nginx is at least 120 MB (lesson video uploads)
