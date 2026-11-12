"""Serve the presentation and the original FloodSystem API on a local address."""

import argparse
import re
import socket
import sys
import threading
import webbrowser
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import HTTPRedirectHandler, Request as UpstreamRequest, build_opener
from uuid import uuid4

from fastapi import HTTPException, Request
from fastapi.responses import FileResponse, RedirectResponse, Response
from pydantic import BaseModel, Field
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.staticfiles import StaticFiles
import uvicorn

INTEGRATION = Path(__file__).resolve().parent
RUNTIME = INTEGRATION / ".runtime"
PRESENTATION = INTEGRATION.parent / "FloodSystem-Pitch.html"
DASHBOARD = RUNTIME / "frontend" / "dist"
LABORATORY = RUNTIME / "laboratory"
DEFAULT_SOURCE = INTEGRATION.parents[1] / "floodsystem-software"
REGIONAL_API = "https://floodsystem-web3d.vercel.app/api/hidro"
SCIENTIFIC_API = "https://floodsystem.duckdns.org/article-api/v1/experiments"


class Calibration(BaseModel):
    k_mm_per_tip: float = Field(default=2.17, gt=0, le=1000, allow_inf_nan=False)


class NoRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def public_data(url: str) -> Response:
    """Read the two original projects' public data without forwarding browser headers."""
    max_bytes = 32 * 1024 * 1024
    request = UpstreamRequest(url, headers={"User-Agent": "FloodSystem-Demonstracao/1.0"})
    try:
        with build_opener(NoRedirects).open(request, timeout=12) as upstream:
            payload = upstream.read(max_bytes + 1)
            if len(payload) > max_bytes:
                raise HTTPException(502, "A resposta da fonte pública excedeu o limite local.")
            headers = {"Cache-Control": "no-store"}
            for name in ("Content-Type", "Content-Disposition"):
                if value := upstream.headers.get(name):
                    headers[name] = value
            return Response(payload, headers=headers)
    except HTTPError as exc:
        status = exc.code if 400 <= exc.code < 500 else 502
        exc.close()
        raise HTTPException(status, "A fonte pública não retornou os dados solicitados.") from exc
    except (URLError, TimeoutError) as exc:
        raise HTTPException(502, "A fonte pública está indisponível.") from exc


def make_app(source: Path, database: Path):
    # Load the original backend and migrations directly from the supplied copy.
    sys.dont_write_bytecode = True
    sys.path.insert(0, str(source))
    from backend.app.core.config import Settings
    from backend.app.main import create_app

    settings = Settings(environment="development", database_path=database)
    app = create_app(settings)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1"])

    @app.get("/", include_in_schema=False)
    def home():
        return RedirectResponse("/apresentacao/#demonstracao")

    @app.get("/apresentacao/", include_in_schema=False)
    def presentation():
        return FileResponse(PRESENTATION, headers={"Cache-Control": "no-store"})

    @app.get("/demonstracao/recursos", include_in_schema=False)
    def features():
        return {"laboratorio_completo": True, "ensaios_publicados": True}

    @app.post("/demonstracao/sessoes", status_code=201)
    def create_session(request: Request, calibration: Calibration):
        if request.headers.get("origin") != str(request.base_url).rstrip("/"):
            raise HTTPException(403, "Abra a demonstração no servidor local.")
        # Each presentation run has its own device, so a reset cannot include older readings.
        repo = request.app.state.repository
        device = f"laboratorio-3d-{uuid4().hex[:12]}"
        repo.register_device(device, "Laboratório 3D", "simulation")
        profile = repo.add_calibration(
            device, valid_from="2000-01-01T00:00:00Z", h0_cm=25.25, k_mm_per_tip=calibration.k_mm_per_tip,
        )
        return {"device_id": device, "h0_cm": profile["h0_cm"], "k_mm_per_tip": profile["k_mm_per_tip"]}

    @app.get("/api/hidro", include_in_schema=False)
    def regional(request: Request):
        query = urlencode({key: request.query_params[key] for key in ("source", "station", "end")
                           if key in request.query_params})
        return public_data(f"{REGIONAL_API}?{query}" if query else REGIONAL_API)

    @app.get("/article-api/v1/experiments", include_in_schema=False)
    def experiments():
        return public_data(SCIENTIFIC_API)

    @app.get("/article-api/v1/experiments/{part:path}", include_in_schema=False)
    def experiment(part: str):
        if not re.fullmatch(r"status|[0-9a-f]{24}(/export)?", part):
            raise HTTPException(404, "Ensaio não encontrado.")
        return public_data(f"{SCIENTIFIC_API}/{part}")

    @app.get("/painel/ensaios/", include_in_schema=False)
    def experiments_page():
        return FileResponse(DASHBOARD / "index.html", headers={"Cache-Control": "no-store"})

    app.mount("/laboratorio", StaticFiles(directory=LABORATORY, html=True), name="laboratorio")
    app.mount("/painel", StaticFiles(directory=DASHBOARD, html=True), name="painel")
    return app


def main():
    parser = argparse.ArgumentParser(description="Apresentação integrada do FloodSystem")
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE, help="Pasta com o projeto original")
    parser.add_argument("--port", type=int, default=4219)
    parser.add_argument("--open", action="store_true", help="Abre a apresentação no navegador")
    args = parser.parse_args()
    source = args.source.resolve()
    if not (source / "backend" / "app" / "main.py").is_file():
        parser.error(f"Projeto original não encontrado em {source}. Inicialize o submódulo ou informe --source.")
    if not all(path.is_file() for path in (PRESENTATION, DASHBOARD / "index.html", LABORATORY / "index.html")):
        parser.error("Execute Preparar-Demonstracao.ps1 para gerar a apresentação, o laboratório e o painel.")

    url = f"http://127.0.0.1:{args.port}/apresentacao/#demonstracao"
    try:
        listener = socket.create_server(("127.0.0.1", args.port))
    except OSError as exc:
        parser.error(f"Não foi possível usar a porta {args.port}: {exc}")
    with listener, TemporaryDirectory(prefix="ensaio-", dir=RUNTIME) as run_dir:
        app = make_app(source, Path(run_dir) / "demonstracao.sqlite3")
        print(f"Demonstração integrada: {url}", flush=True)
        if args.open:
            threading.Timer(0.35, webbrowser.open, args=(url,)).start()
        config = uvicorn.Config(app, host="127.0.0.1", port=args.port, proxy_headers=False, access_log=False)
        uvicorn.Server(config).run(sockets=[listener])


if __name__ == "__main__":
    main()
