"""Run the family app.

    python -m shoulder.api                  http://localhost:8001
    python -m shoulder.api --port 9000

Serves the API under /api, and the built app from app/dist when it exists
(`cd app && npm run build`). In development, run `npm run dev` in app/ instead;
Vite forwards /api here, so the session cookie stays on one origin.
"""

from __future__ import annotations

import argparse

import uvicorn


def main() -> None:
    parser = argparse.ArgumentParser(description="Shoulder family app")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8001)
    args = parser.parse_args()
    print(f"Shoulder on http://{args.host}:{args.port}  (the Rahmans are re-seeded on start)")
    uvicorn.run(
        "shoulder.api.app:create_app",
        factory=True,
        host=args.host,
        port=args.port,
        log_level="info",
    )


if __name__ == "__main__":
    main()
