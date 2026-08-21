"""HTTP mínimo para Yosys → nextpnr → icepack.

Sin FastAPI, sin Node, sin shell. El navegador no entra al contenedor:
POSTea JSON a /compile; este proceso corre los binarios con argv fijo.

Amenazas que nos importan en un VPS:
- inyección en argv / en el -p de Yosys → nombres y top con regex
- DoS de CPU → un compile a la vez, timeout, límites de tamaño
- path traversal → solo basename validado, workdir en tempfile
"""

from __future__ import annotations

import base64
import json
import os
import re
import subprocess
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

BOARD = os.environ.get("BOARD", "azukar-v2")
BOARDS_ROOT = Path(os.environ.get("BOARDS_DIR", "/boards"))
BIND = os.environ.get("COMPILE_BIND", "0.0.0.0")
PORT = int(os.environ.get("COMPILE_PORT", "8090"))
TIMEOUT_SEC = int(os.environ.get("COMPILE_TIMEOUT_SEC", "90"))
MAX_BODY = 320 * 1024
MAX_FILES = 100
MAX_CHARS = 80_000
MAX_FILE_CHARS = 20_000
MAX_PCF_CHARS = 40_000

TOP_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
FILE_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_-]*\.(v|pcf|txt|hex)$")
TOKEN_RE = re.compile(r"^[A-Za-z0-9_.:-]+$")
BOARD_ID_RE = re.compile(r"^[a-z][a-z0-9-]{0,40}$")

_lock = threading.Lock()


def _load_listed_board(board_id: str) -> dict:
    if not BOARD_ID_RE.fullmatch(board_id) or board_id == "custom":
        raise ValueError("board")
    path = BOARDS_ROOT / board_id / "board.json"
    if not path.is_file():
        raise FileNotFoundError(path)
    data = json.loads(path.read_text(encoding="utf-8"))
    device = str(data["fpga"]["nextpnr_device"])
    package = str(data["fpga"]["nextpnr_package"])
    pcf_name = str(data["fpga"]["pcf"])
    if not TOKEN_RE.fullmatch(device) or not TOKEN_RE.fullmatch(package):
        raise ValueError("board.json nextpnr fields look unsafe")
    if pcf_name != Path(pcf_name).name or not pcf_name.endswith(".pcf"):
        raise ValueError("board.json pcf looks unsafe")
    pcf = BOARDS_ROOT / board_id / pcf_name
    if not pcf.is_file():
        raise FileNotFoundError(pcf)
    return {
        "id": board_id,
        "device": device,
        "package": package,
        "pcf_text": pcf.read_text(encoding="utf-8"),
    }


def _load_custom_board(payload: dict) -> dict:
    device = payload.get("device")
    package = payload.get("package")
    pcf_text = payload.get("pcf")
    if not isinstance(device, str) or not TOKEN_RE.fullmatch(device):
        raise ValueError("device")
    if not isinstance(package, str) or not TOKEN_RE.fullmatch(package):
        raise ValueError("package")
    if not isinstance(pcf_text, str) or not pcf_text.strip() or len(pcf_text) > MAX_PCF_CHARS:
        raise ValueError("pcf")
    return {
        "id": "custom",
        "device": device,
        "package": package,
        "pcf_text": pcf_text,
    }


def _resolve_board(payload: dict) -> dict:
    raw = payload.get("board", BOARD)
    if not isinstance(raw, str):
        raise ValueError("board")
    board_id = raw.strip() or BOARD
    if board_id == "custom":
        return _load_custom_board(payload)
    return _load_listed_board(board_id)


def _parse_files(raw: object) -> list[tuple[str, str]]:
    if not isinstance(raw, list) or not raw or len(raw) > MAX_FILES:
        raise ValueError("files")
    out: list[tuple[str, str]] = []
    seen: set[str] = set()
    total = 0
    for item in raw:
        if not isinstance(item, dict):
            raise ValueError("file")
        name = item.get("name")
        content = item.get("content")
        if not isinstance(name, str) or not FILE_RE.fullmatch(name):
            raise ValueError("filename")
        if not isinstance(content, str) or len(content) > MAX_FILE_CHARS:
            raise ValueError("content")
        if name in seen:
            raise ValueError("duplicate")
        seen.add(name)
        total += len(content)
        if total > MAX_CHARS:
            raise ValueError("too big")
        out.append((name, content))
    return out


def _run_compile(top: str, files: list[tuple[str, str]], board: dict) -> dict:
    names = [name for name, _ in files if name.endswith(".v")]
    if not names:
        raise ValueError("no .v files to compile")
    yosys = [
        "yosys",
        "-Q",
        "-p",
        f"synth_ice40 -top {top} -json out.json",
        *names,
    ]
    nextpnr = [
        "nextpnr-ice40",
        f"--{board['device']}",
        "--package",
        board["package"],
        "--json",
        "out.json",
        "--asc",
        "out.asc",
        "--pcf",
        "pins.pcf",
        "--report",
        "out.pnr",
    ]
    icepack = ["icepack", "out.asc", "out.bin"]

    with tempfile.TemporaryDirectory(prefix="fpga-", dir="/tmp") as tmp:
        work = Path(tmp)
        for name, content in files:
            (work / name).write_text(content, encoding="utf-8", newline="\n")
        (work / "pins.pcf").write_text(board["pcf_text"], encoding="utf-8", newline="\n")

        log_parts: list[str] = []
        for title, cmd in (
            ("Yosys (synth_ice40)", yosys),
            ("nextpnr-ice40", nextpnr),
            ("icepack", icepack),
        ):
            log_parts.append(f"======== {title} ========")
            log_parts.append("# " + " ".join(cmd))
            try:
                proc = subprocess.run(
                    cmd,
                    cwd=work,
                    capture_output=True,
                    text=True,
                    timeout=TIMEOUT_SEC,
                    check=False,
                    shell=False,
                )
            except subprocess.TimeoutExpired:
                log_parts.append(f"timeout after {TIMEOUT_SEC}s")
                return {"status": "compile_error", "log": "\n".join(log_parts), "bin_b64": None}
            log_parts.append((proc.stdout or "") + (proc.stderr or ""))
            if proc.returncode != 0:
                return {
                    "status": "compile_error",
                    "log": "\n".join(log_parts).strip(),
                    "bin_b64": None,
                }

        report = work / "out.pnr"
        if report.is_file():
            log_parts.append("======== nextpnr --report ========")
            log_parts.append(report.read_text(encoding="utf-8", errors="replace")[:8000])

        bin_path = work / "out.bin"
        if not bin_path.is_file() or bin_path.stat().st_size <= 0:
            return {
                "status": "compile_error",
                "log": ("\n".join(log_parts).strip() or "no out.bin"),
                "bin_b64": None,
            }
        payload = bin_path.read_bytes()
        return {
            "status": "success",
            "log": "\n".join(log_parts).strip(),
            "bin_b64": base64.b64encode(payload).decode("ascii"),
        }


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args: object) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _send(self, code: int, body: dict) -> None:
        raw = json.dumps(body).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self) -> None:  # noqa: N802
        if self.path.split("?", 1)[0] != "/health":
            self._send(404, {"error": "not_found"})
            return
        self._send(200, {"ok": True, "board": BOARD})

    def do_POST(self) -> None:  # noqa: N802
        if self.path.split("?", 1)[0] != "/compile":
            self._send(404, {"error": "not_found"})
            return
        length = int(self.headers.get("Content-Length") or "0")
        if length <= 0 or length > MAX_BODY:
            self._send(413, {"error": "payload_too_large"})
            return
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._send(400, {"error": "bad_json"})
            return
        if not isinstance(payload, dict):
            self._send(400, {"error": "bad_json"})
            return
        top = payload.get("top")
        if not isinstance(top, str) or not TOP_RE.fullmatch(top.strip()):
            self._send(400, {"error": "top"})
            return
        try:
            files = _parse_files(payload.get("files"))
        except ValueError:
            self._send(400, {"error": "files"})
            return
        try:
            board = _resolve_board(payload)
        except (ValueError, FileNotFoundError, OSError, KeyError, json.JSONDecodeError) as exc:
            self._send(400, {"error": "board", "detail": str(exc)})
            return

        if not _lock.acquire(blocking=False):
            self._send(409, {"error": "busy"})
            return
        try:
            result = _run_compile(top.strip(), files, board)
        except Exception as exc:  # noqa: BLE001 — surface to the log pane
            result = {"status": "compile_error", "log": f"compile server: {exc}", "bin_b64": None}
        finally:
            _lock.release()
        self._send(200, result)


def main() -> None:
    server = ThreadingHTTPServer((BIND, PORT), Handler)
    server.serve_forever()


if __name__ == "__main__":
    main()
