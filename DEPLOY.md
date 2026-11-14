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

`JWT_SECRET` and `CORS_ORIGINS` have **no defaults in the prod profile**: the app
refuses to start without them, which is intentional. Generate the secret with
`openssl rand -base64 48`.

### Transactional email (optional)

QuestLearn sends two kinds of mail: a password-reset link and an address-confirmation
link. Without a provider both are written to the service log at `WARN`, which means
an operator has to relay them; with a provider they arrive in the student's inbox.
Set the public origin the links should use and either a Resend key or SMTP:

```bash
APP_BASE_URL=https://questlearn.example.com
MAIL_FROM=no-reply@questlearn.example.com

# Option A - Resend HTTP API (simplest; no SMTP credentials to keep)
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_...

# Option B - any SMTP provider
EMAIL_PROVIDER=smtp
MAIL_HOST=smtp.example.com
MAIL_PORT=587
MAIL_USERNAME=postgres@questlearn.example.com
MAIL_PASSWORD=replace-with-an-app-password

RESET_TOKEN_MINUTES=30
RESET_MAX_PER_HOUR=3
VERIFICATION_TOKEN_HOURS=48
VERIFICATION_MAX_PER_HOUR=3
```

`EMAIL_PROVIDER=auto` is the default: it picks Resend when `RESEND_API_KEY` is set,
SMTP when `MAIL_HOST` is set, and the log otherwise. Naming a provider without its
settings stops the app at startup instead of swallowing mail.

Deadline reminders reuse the same transport but are **off by default**. Turn them on
once recovery and confirmation mail is working:

```bash
NOTIFICATIONS_ENABLED=true
NOTIFICATIONS_CRON=0 0 7 * * *          # UTC; adjust for your school's morning
NOTIFICATIONS_DUE_SOON_DAYS=7           # the warning window on every screen
NOTIFICATIONS_RETENTION_DAYS=120        # how long the reminder ledger is kept
```

The job sends at most one digest per learner per day, covering every unfinished node
that is due soon or overdue. Overdue work is listed first. A learner can opt out from
the deadline panel on their dashboard, and a failed send is retried on the next run
rather than marked delivered.

While mail is unconfigured, `sudo journalctl -u questlearn | grep 'email not sent'`
shows the latest link. Once it is configured, check the log for
`Email 'Confirm your QuestLearn email address' sent to …` after a test sign-up, and
`Deadline digest run: N learner(s) emailed` after a scheduled run.

Address confirmation is soft: an unconfirmed account keeps full access and sees only
a dashboard reminder. Accounts that predate this feature were migrated as verified.

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

Sign in as an admin, open **War room**, and confirm the account list loads, that
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
| Student forgot their password | Ask them to use **Forgot your password?** on the sign-in page; the link expires in 30 minutes and works once. If mail is not configured or they cannot receive it, War room → **Reset** next to the account and read the one-time temporary password to them. Both paths revoke every session that account had. |
| A student sees "Confirm your email address" | Expected until they open the link; nothing is blocked. Ask them to press **Resend link** on the dashboard, or check `journalctl -u questlearn | grep 'email not sent'` when no provider is configured. |
| A learner is not getting deadline emails | Check that they did not turn the digest off in the dashboard deadline panel, that `NOTIFICATIONS_ENABLED=true`, and that `NOTIFICATIONS_CRON` is set for the school's morning (it is UTC). `journalctl -u questlearn | grep 'Deadline digest run'` shows each run, and a failed send is retried the next day. |
| A learner finished after the due date | Expected: deadlines are advisory. The node is complete and marked `COMPLETED_LATE`; the roster and dashboard show the late state rather than blocking the work. |
| Student wants to retake a node | Nothing to do, completed nodes are replayable and keep the best score, with no extra XP. |
| A node shows as completed but the score is wrong | `DELETE /api/v1/admin/users/{userId}/modules/{moduleId}/progress` as admin; XP for that node is removed and the node becomes playable again. |
| New instructor needs an account | Give them `INSTRUCTOR_INVITE_CODE`, or create the account and change its role in War room. |
| Someone is brute-forcing logins | The account locks for 15 minutes after 5 failures and nginx limits `/auth/login` to 10 requests/minute per IP. Check `journalctl -u questlearn`. |

---

## Known limits of this deployment

These are deliberate trade-offs, not bugs:

- **Email is optional.** Recovery and confirmation links are written to the log when
  no provider is configured. Set `RESEND_API_KEY` or `MAIL_HOST` before opening
  sign-up to the public; delivery failures are logged, not retried from an outbox.
- **Verification is soft.** An unconfirmed address never blocks coursework; it only
  shows a dashboard reminder. That is deliberate, so a mail outage cannot lock a
  class out.
- **Login and mail throttling are in-memory.** Correct for one instance; a second
  instance needs a shared store or edge limiter.
- **Courses can be members-only and grouped into classes.** Cohorts carry join codes,
  rosters narrow to a class, and a course can leave the catalogue until a code adds a
  student. Deadlines are per node and course-wide, with no per-class override in v1;
  the email digest is at most one message per learner per day and has no push or SMS.
- **Deadlines are advisory.** A learner can still clear a node after its due date; the
  product records `COMPLETED_LATE` instead of locking the work. A school that needs a
  hard cut-off should read the late state from the roster.
- **24-hour tokens, no refresh, but they can be revoked.** A session expires a day
  after sign-in; the user signs in again. A password change or an admin reset bumps
  `users.token_version`, which invalidates every earlier token immediately.
- **The audit feed keeps the last 50 actions and has no export.** Role changes,
  password resets, progress resets and course moderation are recorded; retention is
  whatever is in `admin_audit_log`.
- **Files live on one server.** No object storage; uploads are not a feature yet.
  Viva recordings are not an exception: they are graded and discarded.
- **AI output is a draft.** Generated courses are always created unpublished and
  must be reviewed, like any model output, the content can be wrong.

## Data retention

There is no scheduled pruning job other than the reminder ledger, so this table is the
policy an operator should be able to answer questions with. Every value below is either
enforced in code or set by the listed property.

| Data | Table or place | Lifetime |
|---|---|---|
| Password-reset token | `password_reset_tokens`, SHA-256 hash only | 30 minutes, then unusable; a newer request supersedes it |
| Email-verification token | `email_verification_tokens`, SHA-256 hash only | 48 hours; a resend supersedes the older link |
| Sessions | no token table; only `users.token_version` | a token is valid until it expires (24 h) or the version is bumped by a password change or admin reset |
| Login throttling | in-memory counters | cleared on restart |
| Deadline reminder ledger | `deadline_reminders` | `NOTIFICATIONS_RETENTION_DAYS`, default 120 days, so a moved deadline can notify again |
| Admin audit log | `admin_audit_log` | kept indefinitely; there is no automatic pruning, so export or trim it yourself if a retention limit applies to you |
| Server errors | in-memory ring buffer | last 100 only, cleared on restart |
| Application logs | journal or the file you redirect to | whatever your rotation keeps; set a rotation policy and treat logs as containing email addresses |
| Lesson videos | `uploads/videos` on the app server | until the node or course that owns the file is deleted, or the file is removed from disk |
| Backups | your `pg_dump` and a copy of `uploads/videos` | your policy; a backup is only as private as the bucket or disk that holds it |
| Deleted accounts | not implemented | there is no self-service deletion; a request has to be handled by an operator in SQL |

## Pre-launch checklist

- [ ] `JWT_SECRET` is random and not the development default
- [ ] `CORS_ORIGINS` lists only your real origin
- [ ] `DB_USERNAME` is not `postgres`
- [ ] HTTPS works and HTTP redirects to it
- [ ] `/actuator/health` is reachable, `/actuator/metrics` answers only with an admin token, and `/v3/api-docs` is **not** (prod disables it)
- [ ] If nginx or a load balancer should correlate its access log with the app, it forwards `X-Request-Id` (the app generates one when the header is absent)
- [ ] Transactional email is configured and a test sign-up received its confirmation link
- [ ] `NOTIFICATIONS_ENABLED=true` (if wanted) and a test digest arrived at the configured UTC hour
- [ ] A restore from backup has been tested
- [ ] Admin account password changed from the demo value
- [ ] `INSTRUCTOR_INVITE_CODE` set, or instructor signup intentionally disabled
- [ ] `GROQ_API_KEY` set and `GET /api/v1/ai/status` reports `configured: true`
- [ ] One viva recorded from a phone, over HTTPS, and graded successfully
- [ ] `client_max_body_size` in nginx is at least 120 MB (lesson video uploads)
