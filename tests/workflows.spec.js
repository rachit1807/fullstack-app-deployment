import { test, expect } from "@playwright/test";
const account = () => ({
  name: "Alex Morgan",
  email: `qa-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
  password: "Test-pass-2026!",
});
test("API authentication, ownership, validation, persistence, and logout", async ({
  playwright,
  baseURL,
}) => {
  const a = await playwright.request.newContext({ baseURL }),
    b = await playwright.request.newContext({ baseURL });
  expect((await a.get("/api/tasks")).status()).toBe(401);
  const credentials = account();
  expect(
    (await a.post("/api/auth/register", { data: credentials })).ok(),
  ).toBeTruthy();
  expect(
    (await a.post("/api/auth/register", { data: credentials })).status(),
  ).toBe(409);
  const created = await a.post("/api/tasks", {
    data: {
      title: "Verify deployment",
      project: "Launch",
      priority: "high",
      due_date: "2026-10-20",
    },
  });
  expect(created.status()).toBe(201);
  const task = await created.json();
  task.due_date = task.due_date?.slice(0, 10);
  expect((await a.get("/api/tasks")).ok()).toBeTruthy();
  expect(
    (
      await a.post("/api/tasks", { data: { title: "", priority: "urgent" } })
    ).status(),
  ).toBe(400);
  expect(
    (
      await a.post("/api/tasks", {
        data: { title: "Invalid date", due_date: "2026-02-31" },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await a.post("/api/tasks", {
        data: "{broken",
        headers: { "Content-Type": "application/json" },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await a.post("/api/tasks", {
        headers: { origin: "https://foreign.example" },
        data: { title: "Blocked" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (await b.post("/api/auth/register", { data: account() })).ok(),
  ).toBeTruthy();
  expect(await (await b.get("/api/tasks")).json()).toEqual([]);
  expect(
    (
      await b.put("/api/tasks/" + task.id, {
        data: { ...task, title: "Stolen" },
      })
    ).status(),
  ).toBe(404);
  expect((await b.delete("/api/tasks/" + task.id)).status()).toBe(404);
  expect(
    (
      await a.put("/api/tasks/" + task.id, {
        data: { ...task, status: "done" },
      })
    ).ok(),
  ).toBeTruthy();
  await a.post("/api/logout");
  expect((await a.get("/api/tasks")).status()).toBe(401);
  expect(
    (
      await a.post("/api/auth/login", {
        data: { ...credentials, password: "incorrect" },
      })
    ).status(),
  ).toBe(401);
  expect(
    (await a.post("/api/auth/login", { data: credentials })).ok(),
  ).toBeTruthy();
  expect((await (await a.get("/api/tasks")).json())[0].status).toBe("done");
  expect((await a.delete("/api/tasks/" + task.id)).ok()).toBeTruthy();
  await a.dispose();
  await b.dispose();
});
test("desktop task workflow, filtering, editing, board, and theme persistence", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Create an account" }).click();
  const c = account();
  await page.getByLabel("Your name").fill(c.name);
  await page.getByLabel("Email address").fill(c.email);
  await page.locator('[name="password"]').fill(c.password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Let’s make things happen." }),
  ).toBeVisible();
  await page.getByRole("button", { name: /New task/ }).click();
  await page.getByLabel("Task name").fill("Prepare product demo");
  await page
    .getByLabel("Description", { exact: true })
    .fill("Check all the details");
  await page.getByLabel("Project", { exact: true }).fill("Launch");
  await page.locator('#task-form [name="priority"]').selectOption("high");
  await page.getByRole("button", { name: "Save task" }).click();
  await expect(
    page.getByText("Prepare product demo", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Prepare product demo", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Search tasks").fill("missing");
  await expect(page.getByText("Nothing here just yet")).toBeVisible();
  await page.getByLabel("Search tasks").fill("");
  await page
    .getByRole("button", { name: "Prepare product demo Check all the details" })
    .click();
  await page.getByLabel("Task name").fill("Present product demo");
  await page.getByRole("button", { name: "Save task" }).click();
  await page
    .getByLabel("Complete Present product demo", { exact: true })
    .click();
  await expect(page.getByLabel("Reopen Present product demo")).toBeVisible();
  await page.getByRole("button", { name: "Board view" }).click();
  await expect(page.locator(".board")).toBeVisible();
  const before = await page.locator("html").getAttribute("data-theme");
  await page.getByRole("button", { name: /Switch to .* theme/ }).click();
  await page.reload();
  expect(await page.locator("html").getAttribute("data-theme")).not.toBe(
    before,
  );
  expect(errors).toEqual([]);
});
test("mobile registration, modal, navigation, and no horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.getByRole("button", { name: "Create an account" }).click();
  const c = account();
  await page.getByLabel("Your name").fill(c.name);
  await page.getByLabel("Email address").fill(c.email);
  await page.locator('[name="password"]').fill(c.password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.locator("main")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.getByRole("button", { name: /New task/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Task name").fill("A mobile task");
  await page.getByRole("button", { name: "Save task" }).click();
  await expect(page.getByText("A mobile task", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await expect(page.locator("#sidebar")).toHaveClass("open");
  await page.getByRole("button", { name: /Completed/ }).click();
  await expect(page.getByRole("heading", { name: /Completed/ })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});
