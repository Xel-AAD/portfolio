# ============================================================
# MAIN.PY — Весь бэкенд в одном файле
#
# Структура (сверху вниз):
# 1. Импорты и конфигурация
# 2. Модели (Photo)
# 3. Утилиты (prettify_filename, prettify_session_name)
# 4. PortfolioService — сканирование фото, кеш
# 5. FastAPI-приложение: middleware, exception handlers
# 6. Вспомогательные функции (_safe_file, _file_response, _find_assets)
# 7. Маршруты страниц (/, /portfolio/, /reviews/)
# 8. Маршрут sitemap
# 9. API-маршруты (/api/portfolio, /api/gallery)
# 10. Статические файлы (/photos/, /assets/, favicon.ico)
# ============================================================

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse, JSONResponse, Response
from fastapi.templating import Jinja2Templates
from fastapi import HTTPException
from pathlib import Path
from pydantic import BaseModel
from mimetypes import guess_type
import json
import logging
import random
import re
import threading
import time
import uuid
from datetime import date, datetime as _datetime
from xml.sax.saxutils import escape as _xml_escape

_HASHED_RE = re.compile(r'-[a-f0-9]{8,}\.')

try:
    from PIL import Image as _PILImage
except ImportError:
    _PILImage = None


# ============================================================
# 1. КОНФИГУРАЦИЯ — пути и константы
# ============================================================

BASE_DIR = Path(__file__).resolve().parent.parent
PHOTOS_DIR = BASE_DIR / "public" / "photos"
METADATA_FILE = Path(__file__).resolve().parent / "photos.json"
REVIEWS_FILE = Path(__file__).resolve().parent / "reviews.json"
DIST_DIR = BASE_DIR / "dist"
TEMPLATES_DIR = Path(__file__).resolve().parent / "templates"

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".tiff", ".bmp", ".heic", ".avif"}

FAVOURITES_DIR = PHOTOS_DIR / "Favourites"
GALLERY_DIR = PHOTOS_DIR / "Gallery"
ABOUT_DIR = PHOTOS_DIR / "About me"

EXTRA_MIME_TYPES = {
    ".heic": "image/heic",
    ".heif": "image/heic",
    ".avif": "image/avif",
    ".webp": "image/webp",
}


# ============================================================
# 2. МОДЕЛЬ PHOTO — данные одного фото
# ============================================================

class Photo(BaseModel):
    src: str
    title: str
    description: str = ""
    width: int = 0
    height: int = 0


# ============================================================
# 3. УТИЛИТЫ — красивые имена из файлов
# ============================================================

MONTHS_RU = {
    "01": "января", "02": "февраля", "03": "марта",
    "04": "апреля", "05": "мая", "06": "июня",
    "07": "июля", "08": "августа", "09": "сентября",
    "10": "октября", "11": "ноября", "12": "декабря",
}


def prettify_filename(filename: str) -> str:
    name = Path(filename).stem
    parts = [p.strip() for p in name.split("|") if p.strip()]
    is_bw = any("b&w" in p.lower() or "bw" in p.lower() for p in parts)
    num = parts[-1].lstrip("-") if len(parts) > 1 else ""

    title_parts = []
    title_parts.append("Чёрно-белый портрет" if is_bw else "Портрет")
    if num:
        title_parts.append(f"№{num}")

    return ", ".join(title_parts) if title_parts else "Фотография"


def prettify_session_name(dirname: str) -> str:
    m = re.match(r"(\d{1,2})-(\d{2})-(\d{2,4})\s*(.*)", dirname)
    if m:
        d, mo, y, rest = m.group(1), m.group(2), m.group(3), m.group(4).strip()
        if len(y) == 2:
            y = "20" + y
        date_str = f"{int(d)} {MONTHS_RU.get(mo, mo)} {y}"
        if rest:
            name = rest
        else:
            name = date_str
        return name
    return dirname.replace("-", " ").replace("_", " ")


# ============================================================
# 4. PORTFOLIO SERVICE — ядро приложения
#
# Сканирование папок с фото + кеширование по mtime.
# Без генерации миниатюр — фото отдаются как есть.
# ============================================================

class PortfolioService:
    def __init__(self):
        self._cache: dict | None = None
        self._snapshot: dict[str, list[tuple[str, float]]] | None = None
        self._meta_mtime: float = 0.0
        self._lock = threading.Lock()

    def load_metadata(self) -> dict:
        if METADATA_FILE.exists():
            try:
                with open(METADATA_FILE, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        return {}

    def _take_snapshot(self) -> dict[str, list[tuple[str, float]]]:
        snapshot = {}
        scan_dirs = [FAVOURITES_DIR, GALLERY_DIR, ABOUT_DIR]
        for d in scan_dirs:
            if not d.exists():
                snapshot[str(d)] = []
                continue
            entries = []
            if d == GALLERY_DIR:
                for root, _dirs, files in d.walk():
                    for f in files:
                        fp = root / f
                        if fp.suffix.lower() in IMAGE_EXTENSIONS and not fp.name.startswith("."):
                            try:
                                entries.append((str(fp.relative_to(d)), fp.stat().st_mtime))
                            except OSError:
                                pass
            else:
                for f in d.iterdir():
                    if f.is_file() and f.suffix.lower() in IMAGE_EXTENSIONS and not f.name.startswith("."):
                        try:
                            entries.append((f.name, f.stat().st_mtime))
                        except OSError:
                            pass
            entries.sort()
            snapshot[str(d)] = entries
        return snapshot

    @staticmethod
    def _snapshot_changed(a: dict, b: dict) -> bool:
        if a.keys() != b.keys():
            return True
        for k in a:
            if a[k] != b[k]:
                return True
        return False

    def _photo_from_file(self, img_file: Path, photo_meta: dict[str, dict]) -> Photo:
        relative_path = str(img_file.relative_to(PHOTOS_DIR))
        src_path = f"/photos/{relative_path}"

        meta = photo_meta.get(relative_path)
        title = meta.get("title", prettify_filename(img_file.name)) if meta else prettify_filename(img_file.name)
        description = meta.get("description", "") if meta else ""

        w, h = 0, 0
        if _PILImage is not None:
            try:
                with _PILImage.open(img_file) as img:
                    w, h = img.size
            except Exception:
                pass

        return Photo(
            src=src_path,
            title=title,
            description=description,
            width=w,
            height=h,
        )

    def scan_folder(self, folder: Path, photo_meta: dict[str, dict]) -> list[Photo]:
        if not folder.exists():
            return []
        image_files = sorted([
            f for f in folder.iterdir()
            if f.is_file() and f.suffix.lower() in IMAGE_EXTENSIONS and not f.name.startswith(".")
        ])
        return [self._photo_from_file(f, photo_meta) for f in image_files]

    def scan_gallery_sessions(self, photo_meta: dict[str, dict]) -> tuple[list[dict], list[Photo]]:
        if not GALLERY_DIR.exists():
            return [], []

        sessions = []
        all_photos = []

        subdirs = sorted([
            d for d in GALLERY_DIR.iterdir()
            if d.is_dir() and not d.name.startswith(".")
        ])

        if not subdirs:
            photos = self.scan_folder(GALLERY_DIR, photo_meta)
            if photos:
                sessions.append({"id": "all", "title": "Все фотографии", "photos": photos})
                all_photos.extend(photos)
            return sessions, all_photos

        for session_dir in subdirs:
            photos = self.scan_folder(session_dir, photo_meta)
            if photos:
                session_title = prettify_session_name(session_dir.name)
                sessions.append({
                    "id": session_dir.name,
                    "title": session_title,
                    "photos": photos,
                })
                all_photos.extend(photos)

        return sessions, all_photos

    def get_about_photo(self, photo_meta: dict[str, dict]) -> Photo | None:
        if not ABOUT_DIR.exists():
            return None
        image_files = sorted([
            f for f in ABOUT_DIR.iterdir()
            if f.is_file() and f.suffix.lower() in IMAGE_EXTENSIONS and not f.name.startswith(".")
        ])
        if not image_files:
            return None
        return self._photo_from_file(image_files[0], photo_meta)

    def load_reviews(self) -> list[dict]:
        if not REVIEWS_FILE.exists():
            return []
        try:
            with open(REVIEWS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            return []

        reviews = []
        for r in data.get("reviews", []):
            name = r.get("name", "").strip()
            text = r.get("text", "").strip()
            if not text:
                continue
            reviews.append({
                "name": name,
                "text": text,
                "date": r.get("date", "").strip(),
                "rating": r.get("rating"),
            })
        return reviews

    def build(self) -> dict:
        current_snapshot = self._take_snapshot()

        try:
            current_meta_mtime = METADATA_FILE.stat().st_mtime if METADATA_FILE.exists() else 0.0
        except OSError:
            current_meta_mtime = 0.0

        with self._lock:
            if (
                self._cache is not None
                and self._snapshot is not None
                and not self._snapshot_changed(current_snapshot, self._snapshot)
                and current_meta_mtime == self._meta_mtime
            ):
                return self._cache

            self._snapshot = current_snapshot
            self._meta_mtime = current_meta_mtime
            self._rebuild()
            return self._cache

    def _rebuild(self):
        metadata = self.load_metadata()
        photo_meta: dict[str, dict] = {}
        for entry in metadata.get("photos", []):
            photo_meta[entry.get("file", "")] = entry

        featured = self.scan_folder(FAVOURITES_DIR, photo_meta)
        sessions, gallery = self.scan_gallery_sessions(photo_meta)
        about = self.get_about_photo(photo_meta)

        self._cache = {
            "featured": featured,
            "sessions": sessions,
            "gallery": gallery,
            "about": about,
        }


# ============================================================
# 5. FASTAPI-ПРИЛОЖЕНИЕ
# ============================================================

portfolio_service = PortfolioService()
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))


def _jsonsafe(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)[1:-1]


templates.env.filters["jsonsafe"] = _jsonsafe

app = FastAPI(title="Photo Portfolio")

app.add_middleware(GZipMiddleware, minimum_size=1000)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://ekb.photographs.gs",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_methods=["GET"],
    allow_headers=["*"],
)

logger = logging.getLogger("portfolio")


@app.middleware("http")
async def csp_middleware(request: Request, call_next):
    nonce = str(uuid.uuid4())
    request.state.csp_nonce = nonce
    response = await call_next(request)
    if request.url.path.startswith("/assets/") or request.url.path.endswith((".css", ".js")):
        return response
    csp = (
        "default-src 'self'; "
        f"script-src 'self' 'nonce-{nonce}'; "
        "style-src 'self' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com; "
        "img-src 'self' data:; "
        "connect-src 'self'; "
        "form-action https://forms.yandex.ru; "
        "frame-ancestors 'none'"
    )
    response.headers["Content-Security-Policy"] = csp
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@app.middleware("http")
async def cache_control_middleware(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "public, max-age=60"
    return response


_rate_limits: dict[str, list[float]] = {}
_RATE_LIMIT = 60
_RATE_WINDOW = 60
_TRUSTED_PROXIES = {"127.0.0.1", "::1"}


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        first_ip = forwarded.split(",")[0].strip()
        if first_ip and request.client and request.client.host in _TRUSTED_PROXIES:
            return first_ip
    return request.client.host if request.client else "unknown"


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    path = request.url.path
    if path.startswith(("/assets/", "/photos/", "/favicon")):
        return await call_next(request)

    ip = _get_client_ip(request)
    now = time.time()

    requests = _rate_limits.get(ip, [])
    requests = [t for t in requests if now - t < _RATE_WINDOW]

    if len(requests) >= _RATE_LIMIT:
        return Response("Too Many Requests", status_code=429, media_type="text/plain")

    requests.append(now)
    _rate_limits[ip] = requests

    if len(_rate_limits) > 10000:
        expired = [k for k, v in _rate_limits.items() if not v or now - v[-1] >= _RATE_WINDOW]
        for k in expired:
            del _rate_limits[k]
        if not expired:
            oldest = min(_rate_limits, key=lambda k: _rate_limits[k][0] if _rate_limits[k] else 0)
            del _rate_limits[oldest]

    return await call_next(request)


@app.middleware("http")
async def https_redirect_middleware(request: Request, call_next):
    forwarded = request.headers.get("x-forwarded-proto")
    if forwarded and forwarded == "http":
        host = request.headers.get("host", "")
        query_string = f"?{request.url.query}" if request.url.query else ""
        return RedirectResponse(
            url=f"https://{host}{request.url.path}{query_string}",
            status_code=301,
        )
    return await call_next(request)


@app.exception_handler(404)
async def custom_404(request: Request, _exc):
    css_files, js_files = _find_assets()
    return templates.TemplateResponse("404.html", {
        "request": request,
        "page": "404",
        "canonical_path": request.url.path,
        "css_files": css_files,
        "js_files": js_files,
        "lightbox_data": [],
        "gallery_data": [],
        "active_session": None,
        "csp_nonce": _get_nonce(request),
    }, status_code=404)


@app.exception_handler(Exception)
async def custom_500(request: Request, exc):
    logger.exception("Unhandled exception on %s", request.url.path)
    return Response("Internal Server Error", status_code=500, media_type="text/plain")


# ============================================================
# 6. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
# ============================================================

def _safe_file(base_dir: Path, file_path: str) -> Path | None:
    full_path = (base_dir / file_path).resolve()
    if not full_path.is_relative_to(base_dir.resolve()):
        return None
    if full_path.exists() and full_path.is_file():
        return full_path
    return None


def _file_response(full_path: Path) -> FileResponse:
    suffix = full_path.suffix.lower()
    media_type = EXTRA_MIME_TYPES.get(suffix) or guess_type(str(full_path))[0]
    is_hashed = bool(_HASHED_RE.search(full_path.name))
    cache_max = "31536000" if is_hashed else "86400"
    return FileResponse(
        str(full_path),
        media_type=media_type,
        headers={"Cache-Control": f"public, max-age={cache_max}"},
    )


_assets_cache: tuple[list[str], list[str]] | None = None
_assets_cache_mtime: float = 0.0


def _find_assets() -> tuple[list[str], list[str]]:
    global _assets_cache, _assets_cache_mtime
    assets_dir = DIST_DIR / "assets"
    try:
        current_mtime = assets_dir.stat().st_mtime if assets_dir.exists() else 0.0
    except OSError:
        current_mtime = 0.0

    if _assets_cache is not None and current_mtime == _assets_cache_mtime:
        return _assets_cache

    css_files = []
    js_files = []
    if assets_dir.exists():
        for f in assets_dir.iterdir():
            if f.suffix == ".css":
                css_files.append(f.name)
            elif f.suffix == ".js":
                js_files.append(f.name)
    _assets_cache = (css_files, js_files)
    _assets_cache_mtime = current_mtime
    return css_files, js_files


def _get_nonce(request: Request) -> str:
    return getattr(request.state, "csp_nonce", "")


# ============================================================
# 7. МАРШРУТЫ СТРАНИЦ — серверный рендеринг (SSR)
# ============================================================

@app.get("/", response_class=HTMLResponse)
def page_index(request: Request):
    data = portfolio_service.build()
    daily_seed = date.today().toordinal()
    rng = random.Random(daily_seed)
    featured = list(data["featured"])
    rng.shuffle(featured)

    about_photo = data["about"]

    css_files, js_files = _find_assets()
    lightbox_data = [p.model_dump() for p in featured]

    return templates.TemplateResponse("index.html", {
        "request": request,
        "page": "index",
        "canonical_path": "/",
        "css_files": css_files,
        "js_files": js_files,
        "about_photo": about_photo.model_dump() if about_photo else {"src": "", "title": "Александр Ахметов", "description": "", "width": 0, "height": 0},
        "lightbox_data": lightbox_data,
        "gallery_data": [],
        "active_session": None,
        "csp_nonce": _get_nonce(request),
        "now": date.today(),
    })


@app.get("/portfolio", response_class=HTMLResponse)
def page_portfolio_redirect(request: Request):
    return RedirectResponse(url="/portfolio/")


@app.get("/portfolio/", response_class=HTMLResponse)
def page_portfolio(request: Request, session: str | None = None):
    data = portfolio_service.build()
    sessions = data["sessions"]

    active_session = session

    css_files, js_files = _find_assets()

    gallery_data = []
    for s in sessions:
        gallery_data.append({
            "id": s["id"],
            "title": s["title"],
            "photos": [p.model_dump() for p in s["photos"]],
        })

    return templates.TemplateResponse("portfolio.html", {
        "request": request,
        "page": "portfolio",
        "canonical_path": "/portfolio/",
        "css_files": css_files,
        "js_files": js_files,
        "sessions": [{"id": s["id"], "title": s["title"]} for s in sessions],
        "active_session": active_session,
        "lightbox_data": [],
        "gallery_data": gallery_data,
        "csp_nonce": _get_nonce(request),
        "now": date.today(),
    })


@app.get("/reviews", response_class=HTMLResponse)
def page_reviews_redirect(request: Request):
    return RedirectResponse(url="/reviews/")


@app.get("/reviews/", response_class=HTMLResponse)
def page_reviews(request: Request):
    reviews = portfolio_service.load_reviews()
    css_files, js_files = _find_assets()

    avg_rating = round(sum(r["rating"] for r in reviews if r.get("rating")) / max(len([r for r in reviews if r.get("rating")]), 1), 1)

    return templates.TemplateResponse("reviews.html", {
        "request": request,
        "page": "reviews",
        "canonical_path": "/reviews/",
        "css_files": css_files,
        "js_files": js_files,
        "reviews": reviews,
        "avg_rating": avg_rating,
        "lightbox_data": [],
        "gallery_data": [],
        "active_session": None,
        "csp_nonce": _get_nonce(request),
        "now": date.today(),
    })


@app.get("/robots.txt", response_class=Response)
def robots():
    return Response(
        "User-agent: *\nAllow: /\nSitemap: https://ekb.photographs.gs/sitemap.xml\n",
        media_type="text/plain",
    )


# ============================================================
# 8. SITEMAP — динамическая генерация
# ============================================================

@app.get("/sitemap.xml", response_class=Response)
def sitemap():
    data = portfolio_service.build()
    sessions = data["sessions"]
    today = date.today().isoformat()

    def _session_lastmod(session_id: str) -> str:
        session_dir = GALLERY_DIR / session_id
        if not session_dir.exists():
            return today
        max_mtime = 0.0
        try:
            for f in session_dir.iterdir():
                if f.is_file() and f.suffix.lower() in IMAGE_EXTENSIONS and not f.name.startswith("."):
                    try:
                        mtime = f.stat().st_mtime
                        if mtime > max_mtime:
                            max_mtime = mtime
                    except OSError:
                        pass
        except OSError:
            pass
        if max_mtime > 0:
            return _datetime.fromtimestamp(max_mtime).date().isoformat()
        return today

    def _featured_lastmod() -> str:
        max_mtime = 0.0
        if FAVOURITES_DIR.exists():
            for f in FAVOURITES_DIR.iterdir():
                if f.is_file() and f.suffix.lower() in IMAGE_EXTENSIONS and not f.name.startswith("."):
                    try:
                        mtime = f.stat().st_mtime
                        if mtime > max_mtime:
                            max_mtime = mtime
                    except OSError:
                        pass
        if max_mtime > 0:
            return _datetime.fromtimestamp(max_mtime).date().isoformat()
        return today

    def _reviews_lastmod() -> str:
        try:
            mtime = REVIEWS_FILE.stat().st_mtime if REVIEWS_FILE.exists() else 0.0
            if mtime > 0:
                return _datetime.fromtimestamp(mtime).date().isoformat()
        except OSError:
            pass
        return today

    urls = [
        {"loc": "https://ekb.photographs.gs/", "lastmod": _featured_lastmod(), "changefreq": "weekly", "priority": "1.0"},
        {"loc": "https://ekb.photographs.gs/portfolio/", "lastmod": today, "changefreq": "weekly", "priority": "0.8"},
    ]

    for s in sessions:
        urls.append({
            "loc": f"https://ekb.photographs.gs/portfolio/?session={s['id']}",
            "lastmod": _session_lastmod(s["id"]),
            "changefreq": "monthly",
            "priority": "0.6",
        })

    urls.append({"loc": "https://ekb.photographs.gs/reviews/", "lastmod": _reviews_lastmod(), "changefreq": "monthly", "priority": "0.6"})

    xml_parts = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for u in urls:
        xml_parts.append(" <url>")
        xml_parts.append(f"  <loc>{_xml_escape(u['loc'])}</loc>")
        xml_parts.append(f"  <lastmod>{_xml_escape(u['lastmod'])}</lastmod>")
        xml_parts.append(f"  <changefreq>{_xml_escape(u['changefreq'])}</changefreq>")
        xml_parts.append(f"  <priority>{_xml_escape(u['priority'])}</priority>")
        xml_parts.append(" </url>")
    xml_parts.append("</urlset>")

    return Response(content="\n".join(xml_parts), media_type="application/xml")


# ============================================================
# 9. API-МАРШРУТЫ — JSON-эндпоинты
# ============================================================

@app.get("/api/portfolio")
def get_portfolio():
    data = portfolio_service.build()
    daily_seed = date.today().toordinal()
    rng = random.Random(daily_seed)
    featured = list(data["featured"])
    rng.shuffle(featured)

    resp = JSONResponse({
        "featured": [p.model_dump() for p in featured],
        "gallery": [p.model_dump() for p in data["gallery"]],
        "about": data["about"].model_dump() if data["about"] else None,
    })
    resp.headers["X-Robots-Tag"] = "noindex, noarchive"
    return resp


@app.get("/api/gallery")
def get_gallery(session: str | None = None):
    data = portfolio_service.build()
    sessions = data["sessions"]

    if session:
        for s in sessions:
            if s["id"] == session:
                resp = JSONResponse({"photos": [p.model_dump() for p in s["photos"]]})
                resp.headers["X-Robots-Tag"] = "noindex, noarchive"
                return resp
        resp = JSONResponse({"photos": []})
        resp.headers["X-Robots-Tag"] = "noindex, noarchive"
        return resp

    resp = JSONResponse({
        "sessions": [{"id": s["id"], "title": s["title"], "photos": [p.model_dump() for p in s["photos"]]} for s in sessions],
        "all_photos": [p.model_dump() for p in data["gallery"]],
    })
    resp.headers["X-Robots-Tag"] = "noindex, noarchive"
    return resp


# ============================================================
# 10. СТАТИЧЕСКИЕ ФАЙЛЫ
# ============================================================

@app.get("/favicon.ico")
def favicon_ico():
    svg = DIST_DIR / "favicon.svg"
    if not svg.exists():
        svg = BASE_DIR / "public" / "favicon.svg"
    if svg.exists():
        return FileResponse(str(svg), media_type="image/svg+xml", headers={"Cache-Control": "public, max-age=86400"})
    raise HTTPException(status_code=404)


@app.get("/photos/{file_path:path}")
def serve_photo(file_path: str):
    full_path = _safe_file(PHOTOS_DIR, file_path)
    if full_path:
        return _file_response(full_path)
    raise HTTPException(status_code=404)


@app.get("/assets/{file_path:path}")
def serve_asset(file_path: str):
    full_path = _safe_file(DIST_DIR / "assets", file_path)
    if full_path:
        return _file_response(full_path)
    raise HTTPException(status_code=404)


@app.get("/{full_path:path}")
def serve_static(full_path: str):
    full_path = _safe_file(DIST_DIR, full_path)
    if full_path:
        return _file_response(full_path)
    raise HTTPException(status_code=404)
