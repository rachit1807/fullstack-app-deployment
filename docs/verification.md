# Verification notes

Verified on 17 October 2026.

## Automated API checks

Passed against both the isolated local test database and the live Render PostgreSQL-backed service:

- Unauthenticated task access is rejected.
- Registration succeeds; duplicate addresses are rejected.
- Task creation and listing succeed.
- Invalid task input and foreign browser origins are rejected.
- A second account cannot list, edit, or delete another account’s tasks.
- Task completion persists after sign-out and sign-in.
- Incorrect passwords are rejected; owned tasks can be deleted.

Additional local regression checks reject invalid calendar dates and malformed JSON.

## Live browser inspection

- Registration and task creation work against the live API.
- Created tasks remain after a page refresh.
- Editing a task’s priority updates the saved task.
- Search narrows the task list; clearing search restores it.
- List/board views display the task statuses.
- Light and dark themes render with their respective page and text colors.
- Mobile navigation opens, selects Completed, and closes.
- The measured document width is 390px at a 390px phone viewport: no horizontal overflow.
- Laptop layouts and the project sidebar were inspected at 1280px.

## Infrastructure

Render reports a live deployment. `/api/health` returns HTTP 200 and `{"status":"ok"}`. The configured Render health path is `/api/health`. The database uses a dedicated `tasknest` schema; no TeamHub data migration was performed.

## Browser automation

The repository includes desktop and mobile Playwright workflows, and GitHub Actions runs them in Linux. Local automated browser launch was blocked by macOS sandbox restrictions, so live interface checks were performed through the available browser. API automation runs locally without launching a browser.
