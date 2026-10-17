import "dotenv/config";
import express from "express";
import pg from "pg";
import bcrypt from "bcryptjs";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { resolve } from "node:path";
const app = express(),
  production = process.env.NODE_ENV === "production";
const schema = process.env.DATABASE_SCHEMA || "tasknest";
if (!/^[a-z][a-z0-9_]*$/.test(schema))
  throw new Error("Invalid database schema");
if (!process.env.SESSION_SECRET) throw new Error("SESSION_SECRET is required");
let pool;
if (process.env.NODE_ENV === "test") {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  await db.exec(`CREATE SCHEMA ${schema}; SET search_path TO ${schema}`);
  pool = {
    query: async (sql, params) => {
      if (!params && sql.includes(";")) {
        const results = await db.exec(sql);
        return results.at(-1);
      }
      const result = await db.query(sql, params);
      return { ...result, rowCount: result.affectedRows ?? result.rows.length };
    },
    end: () => db.close(),
  };
} else {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const bootstrap = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  await bootstrap.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
  await bootstrap.end();
  pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    options: `-c search_path=${schema}`,
    max: 5,
  });
}
await pool.query(`CREATE TABLE IF NOT EXISTS users(id SERIAL PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tasks(id SERIAL PRIMARY KEY,user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,title TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',project TEXT NOT NULL DEFAULT 'Personal',priority TEXT NOT NULL DEFAULT 'medium',status TEXT NOT NULL DEFAULT 'todo',due_date DATE,created_at TIMESTAMPTZ DEFAULT NOW());`);
app.set("trust proxy", 1);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: { "script-src": ["'self'"], "img-src": ["'self'", "data:"] },
    },
  }),
);
app.use(express.json({ limit: "20kb" }));
const Store = connectPgSimple(session);
app.use(
  session({
    store: new Store({ pool, schemaName: schema, createTableIfMissing: true }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: production,
      maxAge: 604800000,
    },
  }),
);
app.use("/api", (req, res, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && req.get("origin")) {
    if (req.get("origin") !== `${req.protocol}://${req.get("host")}`)
      return res.status(403).json({ error: "Untrusted request origin" });
  }
  next();
});
const authLimit = rateLimit({
  windowMs: 900000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});
const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email });
app.get(
  "/api/health",
  wrap(async (req, res) => {
    await pool.query("SELECT 1");
    res.json({ status: "ok" });
  }),
);
app.get("/api/me", (req, res) => res.json({ user: req.session.user || null }));
app.post(
  "/api/auth/:action",
  authLimit,
  wrap(async (req, res) => {
    const { name, email, password } = req.body;
    const action = req.params.action;
    if (!["login", "register"].includes(action)) return res.sendStatus(404);
    if (
      typeof email !== "string" ||
      !/^\S+@\S+\.\S+$/.test(email) ||
      email.length > 254 ||
      typeof password !== "string" ||
      password.length < 8 ||
      password.length > 72
    )
      return res
        .status(400)
        .json({
          error: "Use a valid email and a password of 8–72 characters.",
        });
    let user;
    if (action === "register") {
      if (typeof name !== "string" || !name.trim() || name.length > 80)
        return res
          .status(400)
          .json({ error: "Enter a name (up to 80 characters)." });
      try {
        user = (
          await pool.query(
            "INSERT INTO users(name,email,password) VALUES($1,$2,$3) RETURNING *",
            [
              name.trim(),
              email.trim().toLowerCase(),
              await bcrypt.hash(password, 12),
            ],
          )
        ).rows[0];
      } catch (e) {
        if (e.code === "23505")
          return res
            .status(409)
            .json({ error: "This email is already registered." });
        throw e;
      }
    } else {
      user = (
        await pool.query("SELECT * FROM users WHERE email=$1", [
          email.trim().toLowerCase(),
        ])
      ).rows[0];
      if (!user || !(await bcrypt.compare(password, user.password)))
        return res
          .status(401)
          .json({ error: "Email or password is incorrect." });
    }
    await new Promise((ok, bad) =>
      req.session.regenerate((e) => (e ? bad(e) : ok())),
    );
    req.session.user = publicUser(user);
    res.json({ user: publicUser(user) });
  }),
);
app.post("/api/logout", (req, res, next) =>
  req.session.destroy((e) => {
    if (e) return next(e);
    res.clearCookie("connect.sid");
    res.json({ ok: true });
  }),
);
app.use("/api/tasks", (req, res, next) =>
  req.session.user
    ? next()
    : res.status(401).json({ error: "Please sign in." }),
);
app.get(
  "/api/tasks",
  wrap(async (req, res) =>
    res.json(
      (
        await pool.query(
          "SELECT * FROM tasks WHERE user_id=$1 ORDER BY created_at DESC",
          [req.session.user.id],
        )
      ).rows,
    ),
  ),
);
function fields(b) {
  const {
    title,
    description = "",
    project = "Personal",
    priority = "medium",
    status = "todo",
    due_date = null,
  } = b;
  if (
    typeof title !== "string" ||
    !title.trim() ||
    title.length > 160 ||
    typeof description !== "string" ||
    description.length > 2000 ||
    typeof project !== "string" ||
    !project.trim() ||
    project.length > 50 ||
    !["low", "medium", "high"].includes(priority) ||
    !["todo", "progress", "done"].includes(status) ||
    (due_date && !/^\d{4}-\d{2}-\d{2}$/.test(due_date))
  )
    return null;
  return [
    title.trim(),
    description.trim(),
    project.trim(),
    priority,
    status,
    due_date || null,
  ];
}
app.post(
  "/api/tasks",
  wrap(async (req, res) => {
    const f = fields(req.body);
    if (!f) return res.status(400).json({ error: "Check the task fields." });
    res
      .status(201)
      .json(
        (
          await pool.query(
            "INSERT INTO tasks(title,description,project,priority,status,due_date,user_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
            [...f, req.session.user.id],
          )
        ).rows[0],
      );
  }),
);
app.put(
  "/api/tasks/:id",
  wrap(async (req, res) => {
    const f = fields(req.body);
    if (!f || !/^\d+$/.test(req.params.id))
      return res.status(400).json({ error: "Check the task fields." });
    const r = await pool.query(
      "UPDATE tasks SET title=$1,description=$2,project=$3,priority=$4,status=$5,due_date=$6 WHERE id=$7 AND user_id=$8 RETURNING *",
      [...f, req.params.id, req.session.user.id],
    );
    res
      .status(r.rowCount ? 200 : 404)
      .json(r.rows[0] || { error: "Task not found." });
  }),
);
app.delete(
  "/api/tasks/:id",
  wrap(async (req, res) => {
    if (!/^\d+$/.test(req.params.id)) return res.sendStatus(400);
    const r = await pool.query("DELETE FROM tasks WHERE id=$1 AND user_id=$2", [
      req.params.id,
      req.session.user.id,
    ]);
    res
      .status(r.rowCount ? 200 : 404)
      .json(r.rowCount ? { ok: true } : { error: "Task not found." });
  }),
);
app.use("/api", (req, res) =>
  res.status(404).json({ error: "Endpoint not found." }),
);
app.use(express.static(resolve("dist")));
app.get("/{*path}", (req, res) => res.sendFile(resolve("dist/index.html")));
app.use((e, req, res, next) => {
  console.error(e.message);
  res.status(500).json({ error: "Something went wrong. Please try again." });
});
const server = app.listen(process.env.PORT || 3000, "0.0.0.0", () =>
  console.log("TaskNest is ready"),
);
process.on("SIGTERM", () =>
  server.close(async () => {
    await pool.end();
    process.exit(0);
  }),
);
