const $ = (s) => document.querySelector(s),
  root = $("#app");
let user = null,
  tasks = [],
  view = "all",
  query = "",
  priority = "all",
  sort = "newest",
  editing = null,
  layout = "list";
let theme =
  localStorage.getItem("tasknest-theme") ||
  (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
document.documentElement.dataset.theme = theme;
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
async function api(path, options = {}) {
  const r = await fetch("/api" + path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  let d;
  try {
    d = await r.json();
  } catch {
    throw Error("Unable to reach the server. Please retry.");
  }
  if (!r.ok) throw Error(d.error || "Request failed");
  return d;
}
function toast(s) {
  $("#toast").textContent = s;
  $("#toast").classList.add("show");
  setTimeout(() => $("#toast").classList.remove("show"), 3200);
}
function toggle() {
  theme = theme === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("tasknest-theme", theme);
  document.querySelectorAll(".theme").forEach((b) => {
    b.textContent = theme === "light" ? "☾" : "☀";
    b.setAttribute(
      "aria-label",
      `Switch to ${theme === "light" ? "dark" : "light"} theme`,
    );
  });
}
function bindTheme() {
  document.querySelectorAll(".theme").forEach((b) => {
    b.textContent = theme === "light" ? "☾" : "☀";
    b.onclick = toggle;
    b.setAttribute(
      "aria-label",
      `Switch to ${theme === "light" ? "dark" : "light"} theme`,
    );
  });
}
function auth(register = false) {
  root.innerHTML = `<div class="auth-page"><div class="auth-story"><a class="brand" href="/"> <span class="brand-icon">✓</span> TaskNest<span class="brand-dot">.</span></a><div class="story-content"><span class="eyebrow">A LITTLE STRUCTURE. A LOT MORE SPACE.</span><h1>Big ideas.<br>Small steps.<br><em>Real progress.</em></h1><p>Your tasks, your projects, your next big thing.<br>Bring it all together in one calm workspace.</p><div class="story-card"><span class="round-check">✓</span><div><strong>Make room for what matters</strong><p>One focused day at a time.</p></div><span class="sparkle">✦</span></div></div><div class="story-footer">Thoughtfully simple. Purposefully yours. <span>✦</span></div></div><div class="auth-panel"><button class="icon-btn theme auth-theme"></button><form id="auth-form"><span class="mini-label">YOUR NEXT CHAPTER STARTS HERE</span><h2>${register ? "Create your workspace" : "Welcome back"}</h2><p>${register ? "A fresh start for everything you want to do." : "Good to see you. Let’s make today count."}</p>${register ? '<label>Your name<input name="name" autocomplete="name" required maxlength="80" placeholder="Rachit Tripathi"></label>' : ""}<label>Email address<input type="email" name="email" autocomplete="email" required placeholder="you@example.com"></label><label>Password<div class="password-wrap"><input type="password" name="password" autocomplete="${register ? "new-password" : "current-password"}" minlength="8" maxlength="72" required placeholder="At least 8 characters"><button type="button" id="show-password" aria-label="Show password">Show</button></div></label><p class="form-error" id="auth-error" role="alert"></p><button class="primary">${register ? "Create account" : "Sign in"} <span>↗</span></button><p class="auth-switch">${register ? "Already have an account?" : "New to TaskNest?"} <button type="button" id="switch-auth">${register ? "Sign in" : "Create an account"}</button></p><div class="auth-note"><span>♧</span> Your workspace is private. Your progress is yours.</div></form><p class="copyright">© ${new Date().getFullYear()} TaskNest. Make space for progress.</p></div></div>`;
  bindTheme();
  $("#switch-auth").onclick = () => auth(!register);
  $("#show-password").onclick = (e) => {
    const i = $("[name=password]");
    i.type = i.type === "password" ? "text" : "password";
    e.target.textContent = i.type === "password" ? "Show" : "Hide";
  };
  $("#auth-form").onsubmit = async (e) => {
    e.preventDefault();
    const b = e.target.querySelector(".primary");
    b.disabled = true;
    try {
      user = (
        await api("/auth/" + (register ? "register" : "login"), {
          method: "POST",
          body: JSON.stringify(Object.fromEntries(new FormData(e.target))),
        })
      ).user;
      tasks = await api("/tasks");
      render();
    } catch (e) {
      $("#auth-error").textContent = e.message;
    } finally {
      b.disabled = false;
    }
  };
}
const today = () => new Date().toLocaleDateString("en-CA");
const dateString = (d) => d?.slice(0, 10);
const isToday = (t) => dateString(t.due_date) === today();
const overdue = (t) =>
  t.status !== "done" && t.due_date && dateString(t.due_date) < today();
const navs = [
  ["all", "▦", "Overview"],
  ["today", "◷", "Today"],
  ["upcoming", "▤", "Upcoming"],
  ["done", "☑", "Completed"],
];
function filtered() {
  return tasks
    .filter(
      (t) =>
        (view === "all" ||
          (view === "today"
            ? isToday(t)
            : view === "upcoming"
              ? t.status !== "done" && dateString(t.due_date) > today()
              : view === "done"
                ? t.status === "done"
                : t.project === view.slice(8))) &&
        (priority === "all" || t.priority === priority) &&
        `${t.title} ${t.description} ${t.project}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "due"
        ? (dateString(a.due_date) || "9999").localeCompare(
            dateString(b.due_date) || "9999",
          )
        : sort === "priority"
          ? { high: 0, medium: 1, low: 2 }[a.priority] -
            { high: 0, medium: 1, low: 2 }[b.priority]
          : b.id - a.id,
    );
}
function setNavigation(open) {
  const sidebar = $("#sidebar");
  if (!sidebar) return;
  const mobile = matchMedia("(max-width:850px)").matches;
  sidebar.classList.toggle("open", open && mobile);
  sidebar.inert = mobile && !open;
  $(".nav-overlay").hidden = !(mobile && open);
  $("#menu").setAttribute("aria-expanded", String(mobile && open));
}
matchMedia("(max-width:850px)").addEventListener("change", () =>
  setNavigation(false),
);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") setNavigation(false);
});
function render() {
  const completed = tasks.filter((t) => t.status === "done").length,
    projects = [...new Set(tasks.map((t) => t.project))].sort();
  root.innerHTML = `<div class="app-shell"><button class="nav-overlay" aria-label="Close navigation" hidden></button><aside id="sidebar"><a href="/" class="brand"><span class="brand-icon">✓</span>TaskNest<span class="brand-dot">.</span></a><div class="workspace-label"><span class="workspace-icon">${esc(user.name.charAt(0).toUpperCase())}</span><div><strong>Personal workspace</strong><small>A little more organized</small></div><span>⌄</span></div><span class="nav-caption">WORKSPACE</span><nav>${navs.map(([id, icon, name]) => `<button class="nav-item ${view === id ? "active" : ""}" data-view="${id}"><span>${icon}</span>${name}<small>${id === "all" ? tasks.length : id === "today" ? tasks.filter(isToday).length : id === "done" ? completed : ""}</small></button>`).join("")}</nav><div class="projects-title"><span class="nav-caption">YOUR PROJECTS</span><button id="new-project" class="icon-btn" aria-label="Create task in a project">+</button></div><div class="project-nav">${projects.length ? projects.map((p, i) => `<button class="nav-item ${view === "project:" + p ? "active" : ""}" data-view="project:${esc(p)}"><i class="project-dot color-${i % 4}"></i>${esc(p)}<small>${tasks.filter((t) => t.project === p && t.status !== "done").length}</small></button>`).join("") : '<p class="sidebar-empty">Your projects will appear here.</p>'}</div><div class="sidebar-bottom"><div class="progress-card"><span>Slow and steady. <b>✦</b></span><p>Every small step is still a step forward.</p><div class="progress-track"><i style="width:${tasks.length ? (completed / tasks.length) * 100 : 0}%"></i></div><small>${completed} of ${tasks.length} tasks completed</small></div><div class="user-profile"><span class="avatar">${esc(user.name.charAt(0).toUpperCase())}</span><div><strong>${esc(user.name)}</strong><small>Personal account</small></div><button id="logout" class="icon-btn" aria-label="Sign out" title="Sign out">↪</button></div></div></aside><div class="main-wrap"><header><div class="header-left"><button id="menu" class="icon-btn" aria-label="Toggle navigation" aria-controls="sidebar" aria-expanded="false">☰</button><span>Workspace <span class="slash">/</span> <strong>${esc(navs.find((n) => n[0] === view)?.[2] || view.slice(8))}</strong></span></div><div class="header-right"><span class="header-date">${new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span><button class="icon-btn theme"></button><span class="avatar small">${esc(user.name.charAt(0).toUpperCase())}</span></div></header><main><section class="greeting"><div><span class="eyebrow">A FRESH PERSPECTIVE, EVERY DAY</span><h1>Let’s make things happen<span class="brand-dot">.</span></h1><p>Hi ${esc(user.name.split(" ")[0])}, a little focus goes a long way.</p></div><button class="primary add-task">+ <span>New task</span></button></section><section class="stats"><article><div class="stat-top"><span>Total tasks</span><i class="stat-icon lavender">▦</i></div><strong>${tasks.length}</strong><small>Your ideas, in motion</small></article><article><div class="stat-top"><span>In progress</span><i class="stat-icon amber">◷</i></div><strong>${tasks.filter((t) => t.status === "progress").length}</strong><small>A little closer every day</small></article><article><div class="stat-top"><span>Completed</span><i class="stat-icon mint">✓</i></div><strong>${completed}</strong><small>Look how far you’ve come</small></article><article><div class="stat-top"><span>Due today</span><i class="stat-icon rose">▤</i></div><strong>${tasks.filter((t) => isToday(t) && t.status !== "done").length}</strong><small>${tasks.filter(overdue).length} overdue · keep moving forward</small></article></section><section class="focus-banner"><div class="focus-symbol">✦</div><div><span class="eyebrow">LESS NOISE. MORE MOMENTUM.</span><h2>You don’t have to do it all today.</h2><p>Pick one thing that matters. Start there.</p></div><div class="banner-art"><i></i><i></i><i></i><span>✓</span></div></section><section class="tasks-section"><div class="section-heading"><div><h2>${esc(view === "all" ? "Your tasks" : navs.find((n) => n[0] === view)?.[2] || view.slice(8))} <span>${filtered().length}</span></h2><p>A clear view of what’s next.</p></div><div class="layout-toggle"><button data-layout="list" class="${layout === "list" ? "selected" : ""}" aria-label="List view">☷</button><button data-layout="board" class="${layout === "board" ? "selected" : ""}" aria-label="Board view">▦</button></div></div><div class="toolbar"><div class="search-wrap"><span>⌕</span><input id="search" type="search" placeholder="Search your tasks…" aria-label="Search tasks" value="${esc(query)}"></div><div class="filters"><select id="priority" aria-label="Filter priority"><option value="all">All priorities</option>${["high", "medium", "low"].map((x) => `<option value="${x}" ${priority === x ? "selected" : ""}>${x[0].toUpperCase() + x.slice(1)} priority</option>`).join("")}</select><select id="sort" aria-label="Sort tasks">${[
    ["newest", "Newest first"],
    ["due", "Due date"],
    ["priority", "Priority"],
  ]
    .map(
      ([v, n]) =>
        `<option value="${v}" ${sort === v ? "selected" : ""}>${n}</option>`,
    )
    .join(
      "",
    )}</select></div></div><div id="task-content"></div></section><footer>Make space for progress. <span>Made for your everyday ✦</span></footer></main></div></div>`;
  drawTasks();
  bindTheme();
  document.querySelectorAll("[data-view]").forEach(
    (b) =>
      (b.onclick = () => {
        view = b.dataset.view;
        query = "";
        render();
      }),
  );
  document
    .querySelectorAll(".add-task")
    .forEach((b) => (b.onclick = () => openTask()));
  $("#new-project").onclick = () => openTask();
  $("#menu").onclick = () =>
    setNavigation(!$("#sidebar").classList.contains("open"));
  $(".nav-overlay").onclick = () => setNavigation(false);
  setNavigation(false);
  $("#logout").onclick = async () => {
    try {
      await api("/logout", { method: "POST" });
      user = null;
      tasks = [];
      auth();
    } catch (e) {
      toast(e.message);
    }
  };
  $("#search").oninput = (e) => {
    query = e.target.value;
    drawTasks();
  };
  $("#priority").onchange = (e) => {
    priority = e.target.value;
    drawTasks();
  };
  $("#sort").onchange = (e) => {
    sort = e.target.value;
    drawTasks();
  };
  document.querySelectorAll("[data-layout]").forEach(
    (b) =>
      (b.onclick = () => {
        layout = b.dataset.layout;
        render();
      }),
  );
}
function row(t) {
  const due = t.due_date
    ? new Date(dateString(t.due_date) + "T12:00:00").toLocaleDateString(
        "en-US",
        { month: "short", day: "numeric" },
      )
    : "No due date";
  return `<article class="task-row ${t.status === "done" ? "is-done" : ""}"><button class="task-check ${t.status === "done" ? "checked" : ""}" data-check="${t.id}" aria-label="${t.status === "done" ? "Reopen" : "Complete"} ${esc(t.title)}">${t.status === "done" ? "✓" : ""}</button><button class="task-title" data-edit="${t.id}"><strong>${esc(t.title)}</strong><small>${esc(t.description || t.project)}</small></button><span class="project-chip">${esc(t.project)}</span><span class="priority ${t.priority}"><i></i>${t.priority}</span><select class="status-select ${t.status}" data-status="${t.id}" aria-label="Status for ${esc(t.title)}">${[
    ["todo", "To do"],
    ["progress", "In progress"],
    ["done", "Completed"],
  ]
    .map(
      ([v, n]) =>
        `<option value="${v}" ${t.status === v ? "selected" : ""}>${n}</option>`,
    )
    .join(
      "",
    )}</select><span class="due ${overdue(t) ? "overdue" : ""}">${due}</span><button class="icon-btn delete" data-delete="${t.id}" aria-label="Delete ${esc(t.title)}">×</button></article>`;
}
function drawTasks() {
  const f = filtered();
  $("#task-content").innerHTML = !f.length
    ? `<div class="empty-state"><div>✦</div><h3>${tasks.length ? "Nothing here just yet" : "A clear space. A fresh start."}</h3><p>${query || priority !== "all" ? "Try another search or filter." : "Add a task and give your next idea a place to grow."}</p><button class="secondary" id="empty-add">+ Create a task</button></div>`
    : layout === "board"
      ? `<div class="board">${[
          ["todo", "To do"],
          ["progress", "In progress"],
          ["done", "Completed"],
        ]
          .map(
            ([v, n]) =>
              `<section><h3><i class="status-dot ${v}"></i>${n}<small>${f.filter((t) => t.status === v).length}</small></h3>${
                f
                  .filter((t) => t.status === v)
                  .map(row)
                  .join("") ||
                '<p class="column-empty">Room for your next step.</p>'
              }</section>`,
          )
          .join("")}</div>`
      : `<div class="table-head"><span>TASK NAME</span><span>PROJECT</span><span>PRIORITY</span><span>STATUS</span><span>DUE DATE</span></div><div class="task-list">${f.map(row).join("")}</div>`;
  if ($("#empty-add")) $("#empty-add").onclick = () => openTask();
  document
    .querySelectorAll("[data-edit]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          openTask(tasks.find((t) => t.id === +b.dataset.edit))),
    );
  document.querySelectorAll("[data-check]").forEach(
    (b) =>
      (b.onclick = () =>
        update(
          tasks.find((t) => t.id === +b.dataset.check),
          {
            status:
              tasks.find((t) => t.id === +b.dataset.check).status === "done"
                ? "todo"
                : "done",
          },
        )),
  );
  document.querySelectorAll("[data-status]").forEach(
    (b) =>
      (b.onchange = () =>
        update(
          tasks.find((t) => t.id === +b.dataset.status),
          { status: b.value },
        )),
  );
  document.querySelectorAll("[data-delete]").forEach(
    (b) =>
      (b.onclick = async () => {
        if (!confirm("Delete this task? This cannot be undone.")) return;
        try {
          await api("/tasks/" + b.dataset.delete, { method: "DELETE" });
          tasks = tasks.filter((t) => t.id !== +b.dataset.delete);
          render();
          toast("Task deleted");
        } catch (e) {
          toast(e.message);
        }
      }),
  );
}
async function update(t, changes) {
  try {
    const updated = await api("/tasks/" + t.id, {
      method: "PUT",
      body: JSON.stringify({
        ...t,
        due_date: dateString(t.due_date),
        ...changes,
      }),
    });
    tasks = tasks.map((x) => (x.id === t.id ? updated : x));
    render();
    toast("Task updated");
  } catch (e) {
    toast(e.message);
    render();
  }
}
function openTask(t) {
  editing = t?.id || null;
  const form = $("#task-form");
  form.reset();
  $("#task-error").textContent = "";
  $("#dialog-title").textContent = t ? "Edit task" : "New task";
  if (t)
    for (const k of [
      "title",
      "description",
      "project",
      "priority",
      "status",
      "due_date",
    ])
      form.elements[k].value = k === "due_date" ? dateString(t[k]) || "" : t[k];
  else if (view.startsWith("project:"))
    form.elements.project.value = view.slice(8);
  $("#projects").innerHTML = [...new Set(tasks.map((t) => t.project))]
    .map((p) => `<option value="${esc(p)}">`)
    .join("");
  $("#task-dialog").showModal();
}
$("#close-modal").onclick = () => $("#task-dialog").close();
$("#task-dialog").addEventListener("click", (e) => {
  if (e.target === $("#task-dialog")) {
    const r = e.target.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      e.target.close();
  }
});
$("#task-form").onsubmit = async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector(".primary");
  btn.disabled = true;
  try {
    const t = await api("/tasks" + (editing ? "/" + editing : ""), {
      method: editing ? "PUT" : "POST",
      body: JSON.stringify(Object.fromEntries(new FormData(e.target))),
    });
    tasks = editing
      ? tasks.map((x) => (x.id === editing ? t : x))
      : [t, ...tasks];
    $("#task-dialog").close();
    render();
    toast(editing ? "Task updated" : "A fresh step forward. Task created.");
  } catch (e) {
    $("#task-error").textContent = e.message;
  } finally {
    btn.disabled = false;
  }
};
try {
  user = (await api("/me")).user;
  if (user) {
    tasks = await api("/tasks");
    render();
  } else auth();
} catch (e) {
  root.innerHTML =
    '<div class="connection-error"><h1>We couldn’t connect.</h1><p>Please check your connection and reload the page.</p><button id="reload" class="primary">Try again</button></div>';
  $("#reload").onclick = () => location.reload();
}
