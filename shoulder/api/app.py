"""The Shoulder family app: HTTP routes over the domain and the database.

    python -m shoulder.api              serves the API, and the built app if present

Everything lives under /api. The browser never holds family data or a readable
credential: logging in sets an httpOnly session cookie, and every response is
the family as the logged-in member is allowed to see it.
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import secrets
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Callable

from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from shoulder.api import domain, projection, seed
from shoulder.api.agents import AgentService
from shoulder.api.db import SESSION_DAYS, Database

COOKIE = "shoulder_session"
# Vite names built scripts and styles by content hash, so they never change.
HASHED_ASSET = re.compile(r"^/assets/[^/]+-[A-Za-z0-9_-]{8}\.(?:js|css)$")
log = logging.getLogger("shoulder.api")
APP_DIST = Path(__file__).resolve().parent.parent.parent / "app" / "dist"


# -- request bodies -----------------------------------------------------------


class Profile(BaseModel):
    name: str = ""
    capacity: float = 0.7
    distance_km: float = 0.0
    days_off: list[str] = Field(default_factory=list)
    refuses: list[str] = Field(default_factory=list)
    private_reason: str = ""
    avatar: str | None = None


class Recipient(BaseModel):
    name: str = ""
    relation: str = "Mum"
    note: str = ""
    avatar: str | None = None
    clear_avatar: bool = False


class CreateFamily(BaseModel):
    recipient: Recipient
    me: Profile


class Login(BaseModel):
    family_code: str
    member_id: str


class ProfileUpdate(BaseModel):
    name: str | None = None
    capacity: float | None = None
    distance_km: float | None = None
    avatar: str | None = None
    clear_avatar: bool = False


class LimitsUpdate(BaseModel):
    days_off: list[str] = Field(default_factory=list)
    refuses: list[str] = Field(default_factory=list)


class AgentInstructions(BaseModel):
    instructions: str = ""


class ReasonUpdate(BaseModel):
    reason: str = ""


class NewTask(BaseModel):
    title: str
    type: str = "visit"
    on_date: str
    duration_min: int = 90
    requires_presence: bool = True
    time: str | None = None
    notes: str = ""
    assignee: str = "auto"


class Assign(BaseModel):
    to: str
    reason: str = ""


class Complete(BaseModel):
    note: str = ""


class Note(BaseModel):
    text: str


class Resolve(BaseModel):
    option_index: int


class Answer(BaseModel):
    approve: bool


# -- rate limiting ------------------------------------------------------------


class RateLimiter:
    """A sliding window per key.

    A member ID is the only thing protecting an account, so anything that tests
    one is limited: enough for a person who mistyped, useless for guessing.
    """

    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, key: str, limit: int, window_s: float) -> bool:
        now = time.monotonic()
        hits = self._hits[key]
        while hits and now - hits[0] > window_s:
            hits.popleft()
        if len(self._hits) > 10_000:
            # Forget keys whose windows have emptied, so memory stays bounded.
            for stale in [k for k, v in self._hits.items() if not v and k != key]:
                del self._hits[stale]
        if len(hits) >= limit:
            return False
        hits.append(now)
        return True


def normalise_code(value: str) -> str:
    return "".join(value.split()).lower()


# -- the app ------------------------------------------------------------------


def create_app(
    db_path: str | None = None,
    reseed_demo: bool = True,
    agent_options: dict[str, Any] | None = None,
) -> FastAPI:
    db = Database(db_path or os.getenv("SHOULDER_DB", ".shoulder/shoulder.db"))
    limiter = RateLimiter()
    secure_cookies = os.getenv("SHOULDER_SECURE_COOKIES", "0") == "1"

    reseed_hours = float(os.getenv("SHOULDER_RESEED_HOURS", "0") or 0)

    async def reseed_every(hours: float) -> None:
        while True:
            await asyncio.sleep(hours * 3600)
            try:
                await asyncio.to_thread(seed.reseed, db)
                log.info("Re-seeded the Rahmans")
            except Exception:  # a failed re-seed must not stop the next one
                log.exception("Re-seeding the Rahmans failed")

    agents = AgentService(db, **(agent_options or {}))

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        agents.start()
        task = None
        if reseed_demo:
            seed.reseed(db)
            if reseed_hours > 0:
                task = asyncio.create_task(reseed_every(reseed_hours))
        yield
        if task:
            task.cancel()
        agents.stop()

    app = FastAPI(title="Shoulder", version="1.0.0", lifespan=lifespan)
    app.state.db = db
    app.state.limiter = limiter
    app.state.agents = agents

    @app.middleware("http")
    async def headers(request: Request, call_next):
        response = await call_next(request)
        path = request.url.path
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "same-origin")
        if path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        elif HASHED_ASSET.match(path):
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        else:
            # The page itself is always revalidated, so a redeploy is picked up
            # at once instead of loading scripts that no longer exist.
            response.headers["Cache-Control"] = "no-cache"
        return response

    @app.exception_handler(domain.DomainError)
    async def _domain_error(_request: Request, exc: domain.DomainError):
        return JSONResponse({"detail": exc.message}, status_code=exc.status)

    def fail(message: str, status: int) -> JSONResponse:
        return JSONResponse({"detail": message}, status_code=status)

    def limited(request: Request, bucket: str, limit: int, window_s: float = 300) -> bool:
        ip = request.client.host if request.client else "unknown"
        return not limiter.allow(f"{bucket}:{ip}", limit, window_s)

    def start_session(response: Response, family_code: str, member_id: str, conn) -> None:
        token = secrets.token_urlsafe(32)
        db.create_session(conn, token, family_code, member_id)
        response.set_cookie(
            COOKIE,
            token,
            max_age=SESSION_DAYS * 86400,
            httponly=True,
            samesite="lax",
            secure=secure_cookies,
            path="/",
        )

    def who(request: Request) -> tuple[str, str] | None:
        token = request.cookies.get(COOKIE)
        return db.session(token) if token else None

    def view(family_code: str, member_id: str) -> dict[str, Any]:
        state = db.read_state(family_code)
        return projection.view_for(
            family_code,
            state,
            member_id,
            db.secrets_for(family_code, member_id),
            db.instructions_for(family_code, member_id),
            agents.view(family_code),
        )

    def mutate(request: Request, change: Callable[[dict[str, Any], str, str, Any], Any]):
        """Run one change for the logged-in member, serialised, then return their view."""
        session = who(request)
        if session is None:
            return fail("Please log in again.", 401)
        family_code, member_id = session
        with db.write() as conn:
            state = db.load_state(conn, family_code)
            if state is None or domain.member(state, member_id) is None:
                return fail("You are no longer part of this family.", 401)
            follow_up = change(state, family_code, member_id, conn)
            db.save_state(conn, family_code, state)
        # Work for the agents is started only once the change is committed.
        if callable(follow_up):
            follow_up()
        return view(family_code, member_id)

    # -- identity ---------------------------------------------------------------

    @app.get("/api/health")
    def health():
        return {"ok": True}

    @app.post("/api/families", status_code=201)
    def create_family(body: CreateFamily, request: Request, response: Response):
        if limited(request, "create", 20, 3600):
            return fail("Too many families created from here. Please try again later.", 429)
        state = domain.new_state(body.recipient.model_dump())
        with db.write() as conn:
            code = domain.new_family_code()
            while db.load_state(conn, code) is not None:
                code = domain.new_family_code()
            member_id = domain.new_member_id(body.me.name)
            record, reason = domain.build_member(member_id, body.me.model_dump(), 0)
            state["members"].append(record)
            domain.add_ledger(
                state,
                f"{domain.short_name(state, member_id)} started the family",
                f"Set up to share the care of {state['recipient']['name']}.",
                member_id,
            )
            db.insert_family(conn, code, state)
            db.insert_member(conn, code, member_id)
            if reason:
                db.put_secret(conn, code, member_id, record["constraints"][0]["id"], reason)
            start_session(response, code, member_id, conn)
        return {"family_code": code, "member_id": member_id}

    @app.get("/api/families/{code}")
    def family_exists(code: str, request: Request):
        if limited(request, "lookup", 30):
            return fail("Too many attempts. Please wait a few minutes and try again.", 429)
        code = normalise_code(code)
        state = db.read_state(code)
        if state is None:
            return fail("No family has that code. Please check it and try again.", 404)
        return {"family_code": code, "recipient_name": state["recipient"]["name"]}

    @app.post("/api/families/{code}/members", status_code=201)
    def join_family(code: str, body: Profile, request: Request, response: Response):
        if limited(request, "join", 20, 3600):
            return fail("Too many attempts. Please try again later.", 429)
        code = normalise_code(code)
        with db.write() as conn:
            state = db.load_state(conn, code)
            if state is None:
                return fail("No family has that code. Please check it and try again.", 404)
            if len(state["members"]) >= 12:
                return fail("This family is full.", 400)
            member_id = domain.new_member_id(body.name)
            while domain.member(state, member_id):
                member_id = domain.new_member_id(body.name)
            color_index = max((m.get("color_index", 0) for m in state["members"]), default=-1) + 1
            record, reason = domain.build_member(member_id, body.model_dump(), color_index)
            state["members"].append(record)
            name = domain.short_name(state, member_id)
            domain.add_ledger(state, f"{name} joined the family", "Added their own limits.", member_id)
            domain.rebalance(state, f"{name} joined")
            db.save_state(conn, code, state)
            db.insert_member(conn, code, member_id)
            if reason:
                db.put_secret(conn, code, member_id, record["constraints"][0]["id"], reason)
            start_session(response, code, member_id, conn)
        agents.request_negotiation(code, f"{name} joined", member_id)
        return {"family_code": code, "member_id": member_id}

    @app.post("/api/session")
    def login(body: Login, request: Request, response: Response):
        if limited(request, "login", 20):
            return fail("Too many attempts. Please wait a few minutes and try again.", 429)
        code = normalise_code(body.family_code)
        member_id = normalise_code(body.member_id)
        if not db.member_exists(code, member_id):
            # One message for both cases, so the form does not confirm which half was right.
            return fail("That family code and member ID do not match. Please check both.", 401)
        with db.write() as conn:
            start_session(response, code, member_id, conn)
        return {"family_code": code, "member_id": member_id}

    @app.get("/api/session")
    def current_session(request: Request):
        # Being logged out is an answer, not an error. A 401 here made every
        # first visit print a red "failed to load resource" in the console.
        session = who(request)
        if session is None:
            return {"authenticated": False}
        return {"authenticated": True, "family_code": session[0], "member_id": session[1]}

    @app.delete("/api/session")
    def logout(request: Request, response: Response):
        token = request.cookies.get(COOKIE)
        if token:
            db.end_session(token)
        response.delete_cookie(COOKIE, path="/")
        return {"ok": True}

    # -- the family -------------------------------------------------------------

    @app.get("/api/family")
    def get_family(request: Request):
        session = who(request)
        if session is None:
            return fail("Please log in again.", 401)
        if db.read_state(session[0]) is None:
            return fail("This family no longer exists.", 401)
        return view(*session)

    # -- me ---------------------------------------------------------------------

    @app.patch("/api/me")
    def update_me(body: ProfileUpdate, request: Request):
        def change(state, code, member_id, _conn):
            m = domain.member(state, member_id)
            moved = False
            if body.name is not None:
                m["name"] = domain._clean_text(body.name, "your name", 80, required=True)
            if body.capacity is not None and domain._capacity(body.capacity) != m["capacity"]:
                m["capacity"] = domain._capacity(body.capacity)
                moved = True
            if body.distance_km is not None and domain._distance(body.distance_km) != m["distance_km"]:
                m["distance_km"] = domain._distance(body.distance_km)
                moved = True
            if body.clear_avatar:
                m["avatar"] = None
            elif body.avatar is not None:
                m["avatar"] = domain._avatar(body.avatar)
            if moved:
                name = domain.short_name(state, member_id)
                domain.rebalance(state, f"{name} changed what they can carry")
                return lambda: agents.request_negotiation(code, f"{name} changed what they can carry", member_id)

        return mutate(request, change)

    @app.put("/api/me/limits")
    def update_limits(body: LimitsUpdate, request: Request):
        def change(state, code, member_id, conn):
            m = domain.member(state, member_id)
            changed, dropped = domain.set_limits(m, body.days_off, body.refuses)
            for constraint_id in dropped:
                db.delete_secret(conn, code, member_id, constraint_id)
            if changed:
                name = domain.short_name(state, member_id)
                domain.rebalance(state, f"{name} changed what they cannot do")
                return lambda: agents.request_negotiation(code, f"{name} changed what they cannot do", member_id)

        return mutate(request, change)

    @app.put("/api/me/agent")
    def update_agent(body: AgentInstructions, request: Request):
        text = domain.clean_instructions(body.instructions)

        def change(state, code, member_id, conn):
            db.put_instructions(conn, code, member_id, text)
            # Only their own agent reads these, but it may now see its share differently.
            name = domain.short_name(state, member_id)
            return lambda: agents.request_negotiation(code, f"{name} gave their agent new instructions", member_id)

        return mutate(request, change)

    @app.get("/api/me/privacy")
    def my_privacy_catches(request: Request):
        """Messages the privacy hook stopped on your behalf. Yours alone."""
        session = who(request)
        if session is None:
            return fail("Please log in again.", 401)
        return {"catches": db.catches_for(*session)}

    @app.put("/api/me/reasons/{constraint_id}")
    def set_reason(constraint_id: str, body: ReasonUpdate, request: Request):
        def change(state, code, member_id, conn):
            m = domain.member(state, member_id)
            c = next((c for c in m["constraints"] if c["id"] == constraint_id), None)
            if c is None:
                raise domain.DomainError("That limit no longer exists.", 404)
            reason = domain._clean_text(body.reason, "the private reason", 1000)
            if reason:
                # Writing a reason makes the limit private. Its shape still binds.
                c["tier"] = "private"
            db.put_secret(conn, code, member_id, constraint_id, reason)
            name = domain.short_name(state, member_id)
            return lambda: agents.request_negotiation(code, f"{name} updated something only their agent knows", member_id)

        return mutate(request, change)

    @app.delete("/api/me")
    def leave_family(request: Request, response: Response):
        session = who(request)
        if session is None:
            return fail("Please log in again.", 401)
        code, member_id = session
        with db.write() as conn:
            state = db.load_state(conn, code)
            if state is not None:
                name = domain.short_name(state, member_id)
                state["members"] = [m for m in state["members"] if m["id"] != member_id]
                if not state["members"]:
                    db.delete_family(conn, code)
                else:
                    state["assignments"] = {
                        t: p for t, p in state["assignments"].items() if p != member_id
                    }
                    domain.add_ledger(state, f"{name} left the family", "Their open tasks were dealt out again.")
                    domain.rebalance(state, f"{name} left")
                    db.save_state(conn, code, state)
                    db.delete_member(conn, code, member_id)
                    agents.request_negotiation(code, f"{name} left", None)
        response.delete_cookie(COOKIE, path="/")
        return {"ok": True}

    # -- the person being cared for ---------------------------------------------

    @app.post("/api/recipient/changes")
    def propose_recipient_change(body: Recipient, request: Request):
        def change(state, _code, member_id, _conn):
            current = state["recipient"]
            proposed = {
                "name": domain._clean_text(body.name, "their name", 80, required=True),
                "relation": body.relation if body.relation in domain.RELATIONS else "Someone else",
                "note": domain._clean_text(body.note, "the note", 200),
                "avatar": None
                if body.clear_avatar
                else domain._avatar(body.avatar) if body.avatar else current.get("avatar"),
            }
            others = [m["id"] for m in state["members"] if m["id"] != member_id]
            name = domain.short_name(state, member_id)
            if not others:
                state["recipient"] = proposed
                domain.add_ledger(state, f"{name} updated {proposed['name']}'s details", "Nobody else to ask.", member_id)
                return
            state["pending_changes"].append(
                {
                    "id": f"chg-{secrets.token_hex(5)}",
                    "initiated_by": member_id,
                    "initiated_at": domain.now_iso(),
                    "changes": {"recipient": proposed},
                    "required": others,
                    "answers": {},
                    "status": "pending",
                }
            )
            domain.add_ledger(
                state,
                f"{name} suggested changing {current['name']}'s details",
                "Details about the person you all care for change only when everyone agrees.",
                member_id,
            )

        return mutate(request, change)

    @app.post("/api/recipient/changes/{change_id}/answer")
    def answer_change(change_id: str, body: Answer, request: Request):
        def change(state, _code, member_id, _conn):
            pending = next(
                (c for c in state["pending_changes"] if c["id"] == change_id and c["status"] == "pending"),
                None,
            )
            if pending is None:
                raise domain.DomainError("This change has already been settled.", 409)
            if member_id not in pending["required"]:
                raise domain.DomainError("This change is not waiting for your answer.", 403)
            pending["answers"][member_id] = body.approve
            name = domain.short_name(state, member_id)
            if not body.approve:
                pending["status"] = "rejected"
                domain.add_ledger(state, f"{name} did not agree to the change", "Nothing was changed.", member_id)
            elif all(pending["answers"].get(m) for m in pending["required"]):
                pending["status"] = "approved"
                state["recipient"] = pending["changes"]["recipient"]
                domain.add_ledger(state, "Everyone agreed, so the change was made", "", member_id)

        return mutate(request, change)

    # -- tasks ------------------------------------------------------------------

    def _task(state, task_id: str) -> dict[str, Any]:
        task = next((t for t in state["tasks"] if t["id"] == task_id), None)
        if task is None:
            raise domain.DomainError("That task no longer exists.", 404)
        return task

    @app.post("/api/tasks")
    def add_task(body: NewTask, request: Request):
        def change(state, code, member_id, _conn):
            if body.type not in domain.TASK_TYPES:
                raise domain.DomainError("Please choose a kind of task.")
            record = {
                "id": f"T-{secrets.token_hex(4)}",
                "title": domain._clean_text(body.title, "a title", 120, required=True),
                "type": body.type,
                "on_date": domain._date(body.on_date),
                "duration_min": max(5, min(24 * 60, int(body.duration_min))),
                "requires_presence": bool(body.requires_presence),
                "time": domain._time(body.time),
                "notes": domain._clean_text(body.notes, "the notes", 1000),
                "is_custom": True,
                "created_by": member_id,
            }
            task = domain.to_care_task(record)
            state["tasks"].append(record)
            me = domain.short_name(state, member_id)

            negotiate = body.assignee in ("", "auto")
            if negotiate:
                holder, blocked = domain.suggest(state, task)
                if holder:
                    why = (
                        f"With {domain.short_name(state, holder)} for now, who has the most room inside "
                        "everyone's limits. The agents will negotiate it with everyone shortly."
                    )
                else:
                    why = "Nobody in the family can take this inside their stated limits."
                if blocked:
                    why += " " + ". ".join(blocked) + "."
            elif body.assignee == "paid":
                holder, why = "paid", f"{me} chose paid help for this."
            else:
                refusal = domain.can_take(state, body.assignee, record)
                if refusal:
                    raise domain.DomainError(refusal + ".")
                holder, why = body.assignee, f"Chosen by {me}."

            if holder == "paid":
                state["covered"][record["id"]] = domain.PAID_HELP
            elif holder:
                state["assignments"][record["id"]] = holder
            state["why"][record["id"]] = why
            taker = domain.short_name(state, holder) if holder else "nobody yet"
            domain.add_ledger(state, f"Added {record['title']}, for {taker}", why, member_id)
            if negotiate:
                return lambda: agents.request_negotiation(code, f"{me} added {record['title']}", member_id)

        return mutate(request, change)

    @app.delete("/api/tasks/{task_id}")
    def delete_task(task_id: str, request: Request):
        def change(state, _code, member_id, _conn):
            task = _task(state, task_id)
            state["tasks"] = [t for t in state["tasks"] if t["id"] != task_id]
            for key in ("assignments", "covered", "why", "task_notes"):
                state[key].pop(task_id, None)
            state["completed"] = [t for t in state["completed"] if t != task_id]
            domain.add_ledger(state, f"Removed {task['title']}", "Taken off the plan.", member_id)

        return mutate(request, change)

    @app.post("/api/tasks/{task_id}/assign")
    def assign_task(task_id: str, body: Assign, request: Request):
        def change(state, code, member_id, _conn):
            task = _task(state, task_id)
            me = domain.short_name(state, member_id)
            why = domain._clean_text(body.reason, "the reason", 300) or f"Moved by {me}."
            pending = state.setdefault("pending_handovers", {})
            if task_id in pending:
                raise domain.DomainError(
                    f"Already asking {domain.short_name(state, pending[task_id]['to'])}'s agent about this task.", 409
                )
            if body.to == "paid":
                state["covered"][task_id] = domain.PAID_HELP
                state["assignments"].pop(task_id, None)
            else:
                refusal = domain.can_take(state, body.to, task)
                if refusal:
                    raise domain.DomainError(refusal + ".")
                to_name = domain.short_name(state, body.to)
                if body.to != member_id and task_id not in state["completed"]:
                    # Work only moves to someone else once their own agent has had its say.
                    pending[task_id] = {
                        "to": body.to,
                        "from": state["assignments"].get(task_id),
                        "by": member_id,
                        "at": domain.now_iso(),
                    }
                    domain.add_ledger(
                        state,
                        f"{me} asked to hand {task['title']} to {to_name}",
                        f"Asking {to_name}'s agent first. It knows what only {to_name} knows.",
                        member_id,
                    )

                    def ask() -> None:
                        if not agents.request_handover(code, task_id, body.to, member_id):
                            _handover_without_agents(code, task_id, member_id)

                    return ask
                state["covered"].pop(task_id, None)
                state["assignments"][task_id] = body.to
            state["why"][task_id] = why
            domain.add_ledger(
                state, f"{task['title']} moved to {domain.short_name(state, body.to)}", why, member_id
            )

        return mutate(request, change)

    def _handover_without_agents(code: str, task_id: str, by: str) -> None:
        """The day's agent budget is spent: move it as asked, and say so."""
        with db.write() as conn:
            state = db.load_state(conn, code)
            if state is None:
                return
            pending = (state.get("pending_handovers") or {}).pop(task_id, None)
            task = next((t for t in state["tasks"] if t["id"] == task_id), None)
            if pending and task and domain.can_take(state, pending["to"], task) is None:
                state["covered"].pop(task_id, None)
                state["assignments"][task_id] = pending["to"]
                state["why"][task_id] = f"Moved by {domain.short_name(state, by)}."
                domain.add_ledger(
                    state,
                    f"{task['title']} moved to {domain.short_name(state, pending['to'])}",
                    "The agents have used today's budget, so this moved without asking their agent.",
                    by,
                )
            db.save_state(conn, code, state)

    @app.post("/api/agents/negotiate")
    def negotiate_now(request: Request):
        session = who(request)
        if session is None:
            return fail("Please log in again.", 401)
        code, member_id = session
        state = db.read_state(code)
        if state is None:
            return fail("This family no longer exists.", 401)
        agents.request_negotiation(code, f"{domain.short_name(state, member_id)} asked for it", member_id, now=True)
        return view(code, member_id)

    @app.post("/api/tasks/{task_id}/complete")
    def toggle_complete(task_id: str, body: Complete, request: Request):
        def change(state, _code, member_id, _conn):
            task = _task(state, task_id)
            me = domain.short_name(state, member_id)
            if task_id in state["completed"]:
                state["completed"].remove(task_id)
                domain.add_ledger(state, f"{me} reopened {task['title']}", "", member_id)
                return
            state["completed"].append(task_id)
            note = domain._clean_text(body.note, "the note", 1000)
            if note:
                state["task_notes"][task_id] = {"text": note, "at": domain.now_iso(), "by": member_id}
            domain.add_ledger(
                state, f"{me} finished {task['title']}", f"Note: {note}" if note else "Marked done.", member_id
            )

        return mutate(request, change)

    @app.put("/api/tasks/{task_id}/note")
    def set_note(task_id: str, body: Note, request: Request):
        def change(state, _code, member_id, _conn):
            _task(state, task_id)
            text = domain._clean_text(body.text, "the note", 1000)
            if text:
                state["task_notes"][task_id] = {"text": text, "at": domain.now_iso(), "by": member_id}
            else:
                state["task_notes"].pop(task_id, None)

        return mutate(request, change)

    # -- decisions --------------------------------------------------------------

    @app.post("/api/escalations/{card_id}/resolve")
    def resolve(card_id: str, body: Resolve, request: Request):
        def change(state, _code, member_id, _conn):
            domain.resolve(state, card_id, body.option_index, member_id)

        return mutate(request, change)

    # -- the built app ----------------------------------------------------------

    if APP_DIST.exists():
        app.mount("/", StaticFiles(directory=APP_DIST, html=True), name="app")

    return app
