# 8. VerityAI course materials

Course readings are PDFs, and learners ask questions about them. That much is
ordinary. What makes this integration worth a page of its own is where the reading
lives: not in QuestLearn, and not even in QuestLearn's database. The file is sent to
a separate service, **VerityAI**, which extracts the text, embeds it, answers
questions over it, and returns the page each part of the answer came from.

QuestLearn keeps the course, the permission check and the citation panel. VerityAI
keeps the document, the chunks and the vector index.

## 8.1 Why a separate service

VerityAI is a document-intelligence application in its own right: PDF processing,
chunking, embeddings, retrieval, Groq calls, page citations and a document
workspace. Copying that into QuestLearn would duplicate a product, not add a
feature.

The boundary is therefore HTTP:

| Concern | Owner |
| --- | --- |
| Course, membership, roles | QuestLearn |
| Who may upload or ask | QuestLearn |
| The PDF bytes and extracted text | VerityAI |
| Chunking, embeddings, retrieval | VerityAI |
| Answer text and page citations | VerityAI |
| Which reading belongs to which course | QuestLearn (`course_materials`) |
| Question quota and audit trail | QuestLearn |

One consequence is deliberate and easy to miss: **all VerityAI documents belong to
one QuestLearn service account**. VerityAI scopes data per account, so the service
account sees every course's PDFs. Course isolation is enforced in QuestLearn by
sending only the document ids that belong to the course being asked about. A learner
never receives a VerityAI session, and a question can only reach the documents
`course_materials` maps to that course.

## 8.2 The shape of a request

```
browser ──JWT──> QuestLearn ──SESSION + CSRF──> VerityAI
                    │                              │
                    ├─ course_materials row        ├─ documents
                    └─ course permission check     └─ conversations / messages
```

1. The browser calls a QuestLearn endpoint under `/api/v1/courses/{courseId}/materials`.
2. QuestLearn checks the learner's or instructor's access to that course.
3. For an upload, QuestLearn validates the PDF and forwards it to VerityAI.
4. VerityAI processes it asynchronously; QuestLearn stores the returned document id
   and the current status.
5. For a question, QuestLearn collects the course's `READY` document ids, creates a
   short-lived VerityAI conversation over exactly those ids, asks the question, maps
   the citations back to QuestLearn rows, and deletes the conversation.

The temporary conversation is deliberate. VerityAI's own chat history is a user
feature; QuestLearn does not need one thread per question, and leaving hundreds
behind would make the service account's workspace unusable.

## 8.3 Schema

`V17__course_materials.sql` adds one table:

| Column | Meaning |
| --- | --- |
| `id` | QuestLearn's row id; also the id the UI and citations use. |
| `course_id` | Owning course. Deleting the course deletes its materials. |
| `verity_document_id` | The UUID VerityAI returned on upload. Unique: one document belongs to one course. |
| `uploaded_by` | The instructor who uploaded it; `SET NULL` when that account is deleted. |
| `filename`, `size_bytes` | What the materials panel shows. |
| `status` | Mirrors VerityAI: `UPLOADED`, `PROCESSING`, `READY`, `FAILED`. |
| `error_message` | VerityAI's reason when processing failed. |
| `created_at`, `updated_at` | Display and debugging. |

The row is the whole bridge. If it is missing, the document may still exist in
VerityAI, but no course can reach it.

Deleting a material removes the VerityAI document first, then the row. If VerityAI is
unreachable, the row stays so a retry can still find the document; the alternative
would be an orphan in the service account's workspace with nothing pointing at it.

## 8.4 Authentication to VerityAI

VerityAI authenticates a browser with a `SESSION` cookie and a CSRF token. QuestLearn
uses the same mechanism with a dedicated service account:

1. `POST /api/v1/auth/login` with `{ email, password }`.
2. Read the `SESSION` cookie from `Set-Cookie`.
3. `GET /api/v1/auth/csrf` with that cookie; keep both the returned `token` and the `XSRF-TOKEN` cookie from `Set-Cookie`.
4. Send `Cookie: SESSION=…; XSRF-TOKEN=…` and `X-XSRF-TOKEN: …` on mutating calls. VerityAI validates the header against the cookie, so dropping either cookie is a 403.

`VerityAiClient` caches the session and reuses it. Three details keep that cache
honest:

- **One login at a time.** A lock guards the cache, and a waiting thread reuses the
  session another thread just created instead of logging in again.
- **A 401 means the session died.** The client logs in once and retries the call.
- **A 403 usually means the CSRF token aged out.** The client fetches a new token and
  its matching cookie over the same session and retries.

VerityAI allows one live session per account, so this is not just an optimisation:
logging in per request would invalidate the previous request's session. Run one
QuestLearn backend against one service account.

The password is never logged. A failed sign-in logs the HTTP status only.

## 8.5 Endpoints

All four require a QuestLearn JWT and a course the caller may reach.

| Method | Path | Who | Behaviour |
| --- | --- | --- | --- |
| `GET` | `/api/v1/courses/{courseId}/materials` | anyone who may view the course | Lists materials. `?refresh=true` asks VerityAI for the current state of unfinished rows and saves changes. |
| `POST` | `/api/v1/courses/{courseId}/materials` | instructor/owner or admin | `multipart/form-data` with `file`; PDF only. Returns 201 with the stored row. |
| `DELETE` | `/api/v1/courses/{courseId}/materials/{materialId}` | instructor/owner or admin | Deletes the VerityAI document and the row. 204. |
| `POST` | `/api/v1/courses/{courseId}/materials/ask` | anyone who may view the course | `{ "question": "…" }`; answers over this course's `READY` materials only. |

`GET` with `refresh=true` is deliberately a read that may write. It is how a panel
polling every few seconds learns that processing finished. A settled course (`READY`
or `FAILED`) costs no VerityAI calls.

### Upload rules

- The filename must end in `.pdf`, and the bytes must begin `%PDF-`. A renamed file is
  rejected before any network call.
- Default cap is 25 MB (`VERITY_MAX_FILE_BYTES`), matching VerityAI's own limit.
- Default cap is 20 materials per course (`VERITY_MAX_MATERIALS_PER_COURSE`).
- The original filename is reduced to its basename and stored; the file is not kept
  by QuestLearn.

### Question rules

- Only `READY` materials are sent. A course with none yet returns 400 with a sentence
  telling the learner to wait for processing.
- The question is trimmed, must be at least 3 characters, and is capped at 4000.
- Each question consumes one unit of the same `AiQuotaService` budget as the viva and
  AI authoring. A question is an AI call regardless of which service performs it.
- Answers carry VerityAI's `evidenceStatus`: `SUFFICIENT`, `INSUFFICIENT` or `NONE`.

### Citation shape

```json
{
  "answer": "Revenue rose 12% in the second quarter [S1].",
  "evidenceStatus": "SUFFICIENT",
  "citations": [
    {
      "materialId": 11,
      "documentName": "annual-report.pdf",
      "pageNumber": 4,
      "excerpt": "Revenue rose 12% in the second quarter."
    }
  ]
}
```

`materialId` is QuestLearn's row id. `documentName` and `pageNumber` come from
VerityAI. If VerityAI returns a document id QuestLearn did not send, the citation is
kept with a null `materialId` rather than trusting it as a course reading.

## 8.6 Failure behaviour

| Failure | What the caller sees |
| --- | --- |
| VerityAI not configured (`VERITY_ENABLED=false` or missing credentials) | 503, "Course materials are not configured on this server." The rest of QuestLearn is unaffected. |
| VerityAI unreachable | 503 when the connection is refused, the host is unknown or the connect timeout expires; 502 when it connects but stalls or fails mid-call. The message names the document service. |
| VerityAI queue full (`429`) | 429, "The document service is busy. Wait a moment, then try again." |
| Processing failed | The row shows `FAILED` and VerityAI's reason; other materials stay usable. |
| Session expired mid-request | The client signs in again and retries once. |
| Conversation delete fails after an answer | Logged at debug; the learner still gets the answer. |

Materials are optional infrastructure: no course-material failure can break quizzes,
the skill tree, auth or email.

## 8.7 Configuration

```properties
VERITY_ENABLED=false
VERITY_BASE_URL=http://localhost:8080/api/v1
VERITY_SERVICE_EMAIL=
VERITY_SERVICE_PASSWORD=
VERITY_MAX_FILE_BYTES=26214400
VERITY_MAX_MATERIALS_PER_COURSE=20
VERITY_CONNECT_TIMEOUT_MS=5000
VERITY_READ_TIMEOUT_MS=120000
```

| Key | Default | Meaning |
| --- | --- | --- |
| `VERITY_ENABLED` | `false` | Master switch. Off means the endpoints answer 503. |
| `VERITY_BASE_URL` | `http://localhost:8080/api/v1` | VerityAI's API root, including `/api/v1`. |
| `VERITY_SERVICE_EMAIL` / `VERITY_SERVICE_PASSWORD` | empty | The dedicated VerityAI account. |
| `VERITY_MAX_FILE_BYTES` | 25 MB | Upload cap. |
| `VERITY_MAX_MATERIALS_PER_COURSE` | `20` | Per-course cap. |
| `VERITY_CONNECT_TIMEOUT_MS` | `5000` | TCP connect timeout. |
| `VERITY_READ_TIMEOUT_MS` | `120000` | Read timeout; a long answer or a big upload needs more than a health check. |

VerityAI defaults to port 8080, while the local QuestLearn backend uses 8091. If both
run on one machine, start VerityAI on another port or point `VERITY_BASE_URL` at the
chosen one.

## 8.8 Setting it up

1. Start VerityAI with its PostgreSQL database and a Groq key. PDF processing needs
   the embedder; answers need the chat model.
2. Register the service account once in VerityAI. Use an address you control; it does
   not need to receive mail for this integration.
3. Fill `VERITY_*` in `questlearn-backend/.env` and restart the backend. Flyway applies
   `V17` on the way up.
4. Open a course as its instructor, choose **Materials**, and upload a PDF.
5. Wait for the status to move from `Queued` to `Ready` (the panel polls).
6. Ask a question. The answer shows its citations and the page each came from.

If step 3 was skipped, the Materials page loads but every action explains that the
service is not configured. That is the intended degradation.

## 8.9 Testing

| Layer | What is covered |
| --- | --- |
| `VerityAiClientTest` | Login + CSRF reuse, both cookies on mutating calls, upload, ask with a short-lived conversation, citation parsing, one retry after a 401, and a refresh after a 403. |
| `CourseMaterialServiceTest` | Upload mapping, non-PDF rejection before the network, ready-only question scope, citation mapping, refusal before processing, delete order. |
| `CourseMaterials.test.jsx` | Instructor upload control, learner view without it, cited answer, multipart body. |

These tests use a mock HTTP layer, not a live VerityAI. The live path is exercised by
hand during setup because it needs a processed PDF and a Groq key.
