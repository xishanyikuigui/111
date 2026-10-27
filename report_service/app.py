"""Render service for the Amazon SQP × Ads report skill.

Files are accepted for one request only, processed in a unique temporary
directory, and removed once the response has been constructed.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from uuid import uuid4

from flask import Flask, Response, jsonify, request
from werkzeug.utils import secure_filename

ROOT = Path(__file__).resolve().parent
SKILL = ROOT / "skill"
SCRIPTS = SKILL / "scripts"
ASSETS = SKILL / "assets"
MAX_FILE_BYTES = int(os.environ.get("MAX_UPLOAD_MB", "80")) * 1024 * 1024
ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "https://xishanyikuigui.github.io")

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_FILE_BYTES


@app.after_request
def cors(response: Response) -> Response:
    origin = request.headers.get("Origin", "")
    if origin == ALLOWED_ORIGIN or origin.endswith(".github.io"):
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
        response.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response


@app.route("/health")
def health():
    return jsonify({"ok": True, "service": "amazon-sqp-ad-report"})


@app.route("/api/reports", methods=["OPTIONS"])
def preflight():
    return Response(status=204)


def _save(files, directory: Path, prefix: str) -> list[Path]:
    saved: list[Path] = []
    for index, upload in enumerate(files):
        if not upload or not upload.filename:
            continue
        name = secure_filename(upload.filename) or f"{prefix}-{index}.csv"
        if not name.lower().endswith(".csv"):
            raise ValueError(f"只支持 CSV 文件：{upload.filename}")
        target = directory / f"{index:02d}-{name}"
        upload.save(target)
        saved.append(target)
    return saved


def _inline_echarts(html: str) -> str:
    library = (ASSETS / "echarts.min.js").read_text(encoding="utf-8")
    return html.replace('<script src="echarts.min.js"></script>', f"<script>\n{library}\n</script>")


def _run_report(sqp_files, ad_files, asin: str, market: str, product: str, price: str) -> str:
    work = Path(tempfile.mkdtemp(prefix="amzws-report-"))
    try:
        sqp_dir, ad_dir, out_dir = work / "sqp", work / "ads", work / "out"
        sqp_dir.mkdir(); ad_dir.mkdir(); out_dir.mkdir()
        for source in sqp_files:
            shutil.copy2(source, sqp_dir / source.name)
        for source in ad_files:
            shutil.copy2(source, ad_dir / source.name)
        command = [
            os.environ.get("PYTHON", "python"), str(SCRIPTS / "build_report.py"),
            "--sqp", str(sqp_dir), "--out", str(out_dir),
            "--asin", asin or "B09TR9J6Q4", "--market", market or "US",
            "--product", product or "",
        ]
        if price:
            command.extend(["--price", price])
        if ad_files:
            command.extend(["--ad", str(ad_dir)])
        result = subprocess.run(command, cwd=out_dir, capture_output=True, text=True, timeout=150)
        if result.returncode:
            raise RuntimeError((result.stderr or result.stdout or "报告管线执行失败")[-5000:])
        report = out_dir / "search_performance_dashboard.html"
        if not report.is_file():
            raise RuntimeError("报告管线未输出 search_performance_dashboard.html")
        return _inline_echarts(report.read_text(encoding="utf-8"))
    finally:
        shutil.rmtree(work, ignore_errors=True)


@app.route("/api/reports", methods=["POST"])
def create_report():
    work = Path(tempfile.mkdtemp(prefix="amzws-upload-"))
    try:
        sqp_dir, ad_dir = work / "sqp", work / "ads"
        sqp_dir.mkdir(); ad_dir.mkdir()
        sqp = _save(request.files.getlist("sqp"), sqp_dir, "sqp")
        ads = _save(request.files.getlist("ads"), ad_dir, "ad")
        if not sqp:
            return jsonify({"error": "请至少上传一份月度 SQP CSV。"}), 400
        if len(sqp) > 12:
            return jsonify({"error": "SQP 最多上传 12 份月度 CSV。"}), 400
        html = _run_report(
            sqp, ads, request.form.get("asin", ""), request.form.get("market", "US"),
            request.form.get("product", ""), request.form.get("price", ""),
        )
        name = f"search_performance_dashboard_{uuid4().hex[:8]}.html"
        return Response(html, mimetype="text/html", headers={
            "Content-Disposition": f'inline; filename="{name}"',
            "Cache-Control": "no-store",
        })
    except subprocess.TimeoutExpired:
        return jsonify({"error": "分析耗时超过 150 秒，请减少文件体积后重试。"}), 504
    except (ValueError, RuntimeError) as error:
        return jsonify({"error": str(error)}), 400
    finally:
        shutil.rmtree(work, ignore_errors=True)


@app.errorhandler(413)
def too_large(_error):
    return jsonify({"error": f"文件总量超过 {MAX_FILE_BYTES // 1024 // 1024} MB 限制。"}), 413

