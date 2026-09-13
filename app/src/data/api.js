/**
 * The only way the app talks to Shoulder.
 *
 * No credential is ever handled here. Logging in sets an httpOnly cookie that
 * this code cannot read; the browser sends it with each request on its own.
 */

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function call(method, path, body) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Shoulder could not be reached. Check your connection and try again.", 0);
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) {
    throw new ApiError(data?.detail || "That did not work. Please try again.", response.status);
  }
  return data;
}

const enc = encodeURIComponent;

export const api = {
  session: () => call("GET", "/session"),
  login: (familyCode, memberId) =>
    call("POST", "/session", { family_code: familyCode, member_id: memberId }),
  logout: () => call("DELETE", "/session"),

  lookupFamily: (code) => call("GET", `/families/${enc(code)}`),
  createFamily: (recipient, me) => call("POST", "/families", { recipient, me }),
  joinFamily: (code, profile) => call("POST", `/families/${enc(code)}/members`, profile),

  family: () => call("GET", "/family"),

  updateMe: (fields) => call("PATCH", "/me", fields),
  toggleDay: (day) => call("POST", "/me/days", { day }),
  setReason: (constraintId, reason) => call("PUT", `/me/reasons/${enc(constraintId)}`, { reason }),
  privacyCatches: () => call("GET", "/me/privacy"),
  leave: () => call("DELETE", "/me"),

  proposeRecipient: (fields) => call("POST", "/recipient/changes", fields),
  answerChange: (changeId, approve) =>
    call("POST", `/recipient/changes/${enc(changeId)}/answer`, { approve }),

  addTask: (task) => call("POST", "/tasks", task),
  deleteTask: (taskId) => call("DELETE", `/tasks/${enc(taskId)}`),
  assignTask: (taskId, to) => call("POST", `/tasks/${enc(taskId)}/assign`, { to }),
  toggleComplete: (taskId, note = "") => call("POST", `/tasks/${enc(taskId)}/complete`, { note }),
  setNote: (taskId, text) => call("PUT", `/tasks/${enc(taskId)}/note`, { text }),

  resolve: (cardId, optionIndex) =>
    call("POST", `/escalations/${enc(cardId)}/resolve`, { option_index: optionIndex }),
};
