import { useEffect, useMemo, useState } from "react";
import axios from "axios";

const TASKS_API = "/api/tasks";
const STATS_API = "/api/stats";
const NOTIFICATIONS_API = "/api/notifications";
const STATUS_API = "/api/status";
const LOGIN_API = "/api/login";
const VERIFY_API = "/api/verify";

function App() {
  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState("");
  const [stats, setStats] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [systemStatus, setSystemStatus] = useState(null);
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState(() => localStorage.getItem("taskflowToken") || "");
  const [authState, setAuthState] = useState(token ? "checking" : "signed-out");
  const [error, setError] = useState("");

  const isSignedIn = authState === "signed-in";

  const statusItems = useMemo(() => {
    if (!systemStatus?.services) return [];
    return Object.entries(systemStatus.services);
  }, [systemStatus]);

  const fetchTasks = async () => {
    const res = await axios.get(TASKS_API);
    setTasks(Array.isArray(res.data) ? res.data : []);
  };

  const fetchStats = async () => {
    const res = await axios.get(STATS_API);
    setStats(res.data);
  };

  const fetchNotifications = async () => {
    const res = await axios.get(NOTIFICATIONS_API);
    setNotifications(Array.isArray(res.data) ? res.data : []);
  };

  const fetchSystemStatus = async () => {
    const res = await axios.get(STATUS_API);
    setSystemStatus(res.data);
  };

  const refreshDashboard = async () => {
    setError("");
    const results = await Promise.allSettled([
      fetchTasks(),
      fetchStats(),
      fetchNotifications(),
      fetchSystemStatus(),
    ]);

    const failed = results.find((result) => result.status === "rejected");
    if (failed) {
      const reason = failed.reason;
      setError(reason.response?.data?.error || reason.message || "Some services are unavailable");
    }
  };

  useEffect(() => {
    refreshDashboard();
  }, []);

  useEffect(() => {
    const verifyToken = async () => {
      if (!token) {
        setAuthState("signed-out");
        return;
      }

      try {
        await axios.get(VERIFY_API, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setAuthState("signed-in");
      } catch (err) {
        localStorage.removeItem("taskflowToken");
        setToken("");
        setAuthState("signed-out");
      }
    };

    verifyToken();
  }, [token]);

  const addTask = async () => {
    if (!title.trim()) return;

    await axios.post(TASKS_API, { title: title.trim() });
    setTitle("");
    await refreshDashboard();
  };

  const completeTask = async (id) => {
    await axios.put(`${TASKS_API}/${id}`, { status: "completed" });
    await refreshDashboard();
  };

  const deleteTask = async (id) => {
    await axios.delete(`${TASKS_API}/${id}`);
    await refreshDashboard();
  };

  const login = async (event) => {
    event.preventDefault();
    setError("");

    try {
      const res = await axios.post(LOGIN_API, { username, password });
      localStorage.setItem("taskflowToken", res.data.token);
      setToken(res.data.token);
      setPassword("");
      setAuthState("signed-in");
    } catch (err) {
      setAuthState("signed-out");
      setError(err.response?.data?.error || "Login failed");
    }
  };

  const logout = () => {
    localStorage.removeItem("taskflowToken");
    setToken("");
    setAuthState("signed-out");
  };

  const clearNotifications = async () => {
    await axios.delete(NOTIFICATIONS_API);
    await fetchNotifications();
  };

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">TaskFlow</p>
          <h1>Operations dashboard</h1>
        </div>
        <button className="secondary-button" onClick={refreshDashboard}>Refresh</button>
      </section>

      {error && <div className="alert">{error}</div>}

      <section className="metrics-grid">
        <div className="metric-card">
          <span>Total</span>
          <strong>{stats?.total ?? tasks.length}</strong>
        </div>
        <div className="metric-card">
          <span>Completed</span>
          <strong>{stats?.completed ?? 0}</strong>
        </div>
        <div className="metric-card">
          <span>Pending</span>
          <strong>{stats?.pending ?? 0}</strong>
        </div>
        <div className="metric-card">
          <span>System</span>
          <strong className={systemStatus?.overall === "healthy" ? "ok" : "warn"}>
            {systemStatus?.overall || "unknown"}
          </strong>
        </div>
      </section>

      <section className="content-grid">
        <div className="panel tasks-panel">
          <div className="panel-header">
            <h2>Tasks</h2>
          </div>

          <div className="input-box">
            <input
              type="text"
              placeholder="Enter task"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTask()}
            />
            <button onClick={addTask}>Add</button>
          </div>

          <div className="task-list">
            {tasks.map((task) => (
              <div className="task" key={task._id}>
                <span>{task.title}</span>
                <small>{task.status}</small>
                <div className="task-actions">
                  <button onClick={() => completeTask(task._id)}>Complete</button>
                  <button className="danger-button" onClick={() => deleteTask(task._id)}>Delete</button>
                </div>
              </div>
            ))}
            {tasks.length === 0 && <p className="empty-state">No tasks yet.</p>}
          </div>
        </div>

        <aside className="side-stack">
          <div className="panel">
            <div className="panel-header">
              <h2>Auth</h2>
              <span className={isSignedIn ? "pill ok-pill" : "pill"}>{authState}</span>
            </div>

            {isSignedIn ? (
              <button className="secondary-button full-width" onClick={logout}>Sign out</button>
            ) : (
              <form className="login-form" onSubmit={login}>
                <input
                  type="text"
                  placeholder="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button type="submit">Sign in</button>
              </form>
            )}
          </div>

          <div className="panel">
            <div className="panel-header">
              <h2>Status</h2>
            </div>
            <div className="status-list">
              {statusItems.map(([name, result]) => (
                <div className="status-row" key={name}>
                  <span>{name}</span>
                  <strong className={result.status === "up" ? "ok" : "warn"}>
                    {result.status}
                  </strong>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h2>Notifications</h2>
              <button className="link-button" onClick={clearNotifications}>Clear</button>
            </div>
            <div className="notification-list">
              {notifications.slice(0, 5).map((item) => (
                <div className="notification" key={item.id}>
                  <span>{item.message}</span>
                  <small>{new Date(item.createdAt).toLocaleString()}</small>
                </div>
              ))}
              {notifications.length === 0 && <p className="empty-state">No notifications.</p>}
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}

export default App;
