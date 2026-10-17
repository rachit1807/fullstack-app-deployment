# API reference

All routes use JSON. Authentication uses a server-side session cookie. Send requests from the app’s origin; use `credentials: "include"` if writing a compatible client.

| Method | Route                | Description                                    |
| ------ | -------------------- | ---------------------------------------------- |
| GET    | `/api/health`        | Check server and database availability         |
| GET    | `/api/me`            | Return current user, or `null`                 |
| POST   | `/api/auth/register` | Create an account: `name`, `email`, `password` |
| POST   | `/api/auth/login`    | Sign in: `email`, `password`                   |
| POST   | `/api/logout`        | Destroy the session                            |
| GET    | `/api/tasks`         | List the signed-in user’s tasks                |
| POST   | `/api/tasks`         | Create a task                                  |
| PUT    | `/api/tasks/:id`     | Replace editable task fields                   |
| DELETE | `/api/tasks/:id`     | Delete an owned task                           |

## Task payload

```json
{
  "title": "Prepare the project demo",
  "description": "Check mobile layouts and document the deployment.",
  "project": "Product launch",
  "priority": "high",
  "status": "progress",
  "due_date": "2026-10-20"
}
```

`title` is required (1–160 characters). Description allows 2,000 characters; project allows 1–50 characters. Priority is `low`, `medium`, or `high`. Status is `todo`, `progress`, or `done`. Due date is an ISO calendar date or `null`.

Passwords must contain 8–72 characters. Names allow up to 80 characters. Email addresses are stored in lowercase. Authentication endpoints allow 30 requests per 15-minute window per IP.

## Errors

Errors return `{ "error": "Readable explanation" }` with an appropriate status. Common statuses: `400` invalid input, `401` unauthenticated or invalid credentials, `403` foreign origin, `404` missing or unowned task, `409` duplicate email, and `429` authentication rate limit.
