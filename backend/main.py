from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse, JSONResponse, Response
from fastapi.templating import Jinja2Templates
from fastapi import HTTPException
from pathlib import Path
from pydantic import BaseModel
from urllib.parse import unquote
from mimetypes import guess_type
import json
import random
import re
import hashlib
from datetime import date

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

try:
    import pillow_avif
    HAS_AVIF = True
except ImportError:
    HAS_AVIF = False

BASE_DIR = Path(__file__).resolve().parent.parent
PHOTOS_DIR = BASE_DIR / "public" / "photos"
METADATA_FILE = Path(__file__).resolve().parent / "photos.json"
REVIEWS_FILE = Path(__file__).resolve().parent / "reviews.json"
DIST_DIR = BASE_DIR / "dist"
THUMBS_DIR = BASE_DIR / "public" / "thumbs"
MODERN_DIR = BASE_DIR / "public" / "modern"
DIMENSIONS_CACHE_FILE = THUMBS_DIR / ".dimensions.json"
TEMPLATES_DIR = Path(__file__).resolve().parent / "templates"

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".tiff", ".bmp", ".heic", ".avif"}

THUMB_MAX_W = 1200
THUMB_QUALITY = 80

FAVOURITES_DIR = PHOTOS_DIR / "Favourites"
GALLERY_DIR = PHOTOS_DIR / "Gallery"
ABOUT_DIR = PHOTOS_DIR / "About me"

EXTRA_MIME_TYPES = {
    ".heic": "image/heic",
    ".heif": "image/heic",
    ".avif": "image/avif",
    ".webp": "image/webp",
}


class Photo(BaseModel):
    src: str
    thumb: str
    thumb_webp: str = ""
    thumb_avif: str = ""
    title: str
    description: str
    width: int = 0
    height: int = 0


MONTHS_RU = {
    "01": "января", "02": "февраля", "03": "марта",
    "04": "апреля", "05": "мая", "06": "июня",
    "07": "июля", "08": "августа", "09": "сентября",
    "10": "октября", "11": "ноября", "12": "декабря",
}


def prettify_filename(filename: str) -> str:
    name = Path(filename).stem
    parts = [p.strip() for p in name.split("|") if p.strip()]
    date_str = parts[0] if parts else ""
    is_bw = any("b&w" in p.lower() or "bw" in p.lower() for p in parts)
    num = parts[-1].lstrip("-") if len(parts) > 1 else ""

    date_fmt = ""
    if date_str and re.match(r"\d{1,2}-\d{2}-\d{2,4}$", date_str):
        d, m, y = date_str.split("-")
        if len(y) == 2:
            y = "20" + y
        date_fmt = f"{int(d)} {MONTHS_RU.get(m, m)} {y}"

    title_parts = []
    title_parts.append("Чёрно-белый портрет" if is_bw else "Портрет")
    if num:
        title_parts.append(f"№{num}")

    return ", ".join(title_parts) if title_parts else filename


def prettify_session_name(dirname: str) -> str:
    m = re.match(r"(\d{1,2})-(\d{2})-(\d{2,4})\s*(.*)", dirname)
    if m:
        d, mo, y, rest = m.group(1), m.group(2), m.group(3), m.group(4).strip()
        if len(y) == 2:
            y = "20" + y
        date_str = f"{int(d)} {MONTHS_RU.get(mo, mo)} {y}"
        if rest:
            name = f"{rest} — {date_str}"
        else:
            name = date_str
        return name
    return dirname.replace("-", " ").replace("_", " ")


class PortfolioService:
    def __init__(self):
        self._cache: dict | None = None
        self._snapshot: dict[str, list[tuple[str, float]]] | None = None
        self._meta_mtime: float = 0.0
        self._dim_cache: dict[str, dict] = {}

    def _load_dim_cache(self) -> dict[str, dict]:
        if DIMENSIONS_CACHE_FILE.exists():
            try:
                with open(DIMENSIONS_CACHE_FILE, "r") as f:
                    return json.load(f)
            except Exception:
                pass
        return {}

    def _save_dim_cache(self):
        THUMBS_DIR.mkdir(parents=True, exist_ok=True)
        try:
            with open(DIMENSIONS_CACHE_FILE, "w") as f:
                json.dump(self._dim_cache, f)
        except Exception:
            pass

    def get_dimensions(self, filepath: Path) -> tuple[int, int]:
        if not HAS_PIL:
            return 0, 0

        try:
            mtime = filepath.stat().st_mtime
        except OSError:
            return 0, 0

        rel = str(filepath.relative_to(PHOTOS_DIR))
        cached = self._dim_cache.get(rel)
        if cached and cached.get("mtime") == mtime:
            return cached["width"], cached["height"]

        try:
            with Image.open(filepath) as img:
                w, h = img.size
                self._dim_cache[rel] = {"width": w, "height": h, "mtime": mtime}
                return w, h
        except Exception:
            return 0, 0

    def thumb_path_for(self, original: Path) -> Path:
        rel = original.relative_to(PHOTOS_DIR)
        parts = list(rel.parts)
        safe_name = hashlib.sha256(parts[-1].encode()).hexdigest()[:16] + Path(parts[-1]).suffix.lower()
        parts[-1] = safe_name
        return THUMBS_DIR.joinpath(*parts)

    def ensure_thumb(self, original: Path) -> Path:
        thumb = self.thumb_path_for(original)
        if thumb.exists():
            try:
                mtime_orig = original.stat().st_mtime
                mtime_thumb = thumb.stat().st_mtime
                if mtime_thumb >= mtime_orig:
                    return thumb
            except OSError:
                pass

        if not HAS_PIL:
            return original

        try:
            thumb.parent.mkdir(parents=True, exist_ok=True)
            with Image.open(original) as img:
                img.thumbnail((THUMB_MAX_W, THUMB_MAX_W * 3), Image.LANCZOS)
                if img.mode in ("RGBA", "P"):
                    img = img.convert("RGB")
                img.save(str(thumb), "JPEG", quality=THUMB_QUALITY, progressive=True)
            return thumb
        except Exception:
            return original

    def _modern_path_for(self, thumb: Path, ext: str) -> Path:
        rel = thumb.relative_to(THUMBS_DIR)
        parts = list(rel.parts)
        stem = Path(parts[-1]).stem
        parts[-1] = stem + ext
        return MODERN_DIR.joinpath(*parts)

    def ensure_modern(self, thumb: Path) -> tuple[str, str]:
        if not HAS_PIL:
            return "", ""

        webp_path = self._modern_path_for(thumb, ".webp")
        avif_path = self._modern_path_for(thumb, ".avif")
        webp_url = ""
        avif_url = ""

        try:
            mtime_thumb = thumb.stat().st_mtime
        except OSError:
            return "", ""

        if webp_path.exists():
            try:
                if webp_path.stat().st_mtime >= mtime_thumb:
                    webp_url = f"/modern/{webp_path.relative_to(MODERN_DIR)}"
            except OSError:
                pass

        if not webp_url:
            try:
                webp_path.parent.mkdir(parents=True, exist_ok=True)
                with Image.open(thumb) as img:
                    if img.mode in ("RGBA", "P"):
                        img = img.convert("RGB")
                    img.save(str(webp_path), "WEBP", quality=80, method=4)
                webp_url = f"/modern/{webp_path.relative_to(MODERN_DIR)}"
            except Exception:
                pass

        if HAS_AVIF and avif_path.exists():
            try:
                if avif_path.stat().st_mtime >= mtime_thumb:
                    avif_url = f"/modern/{avif_path.relative_to(MODERN_DIR)}"
            except OSError:
                pass

        if HAS_AVIF and not avif_url:
            try:
                avif_path.parent.mkdir(parents=True, exist_ok=True)
                with Image.open(thumb) as img:
                    if img.mode in ("RGBA", "P"):
                        img = img.convert("RGB")
                    img.save(str(avif_path), "AVIF", quality=75, speed=4)
                avif_url = f"/modern/{avif_path.relative_to(MODERN_DIR)}"
            except Exception:
                pass

        return webp_url, avif_url

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

        thumb = self.ensure_thumb(img_file)
        if thumb.is_relative_to(THUMBS_DIR):
            thumb_rel = str(thumb.relative_to(THUMBS_DIR))
            thumb_path_str = f"/thumbs/{thumb_rel}"
        else:
            thumb_path_str = src_path

        thumb_webp, thumb_avif = "", ""
        if thumb.is_relative_to(THUMBS_DIR):
            thumb_webp, thumb_avif = self.ensure_modern(thumb)

        meta = photo_meta.get(relative_path)
        title = meta.get("title", prettify_filename(img_file.name)) if meta else prettify_filename(img_file.name)
        description = meta.get("description", "") if meta else ""

        w, h = self.get_dimensions(img_file)

        return Photo(
            src=src_path,
            thumb=thumb_path_str,
            thumb_webp=thumb_webp,
            thumb_avif=thumb_avif,
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

        img_file = image_files[0]
        return self._photo_from_file(img_file, photo_meta)

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
            reviews.append({
                "name": r.get("name", ""),
                "text": r.get("text", ""),
                "date": r.get("date", ""),
                "rating": r.get("rating"),
            })
        return reviews

    def build(self) -> dict:
        current_snapshot = self._take_snapshot()

        try:
            current_meta_mtime = METADATA_FILE.stat().st_mtime if METADATA_FILE.exists() else 0.0
        except OSError:
            current_meta_mtime = 0.0

        if (
            self._cache is not None
            and self._snapshot is not None
            and not self._snapshot_changed(current_snapshot, self._snapshot)
            and current_meta_mtime == self._meta_mtime
        ):
            return self._cache

        self._snapshot = current_snapshot
        self._meta_mtime = current_meta_mtime
        self._dim_cache = self._load_dim_cache()

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
        self._save_dim_cache()

        return self._cache


portfolio_service = PortfolioService()
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))

app = FastAPI(title="Photo Portfolio")

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


@app.middleware("http")
async def cache_control_middleware(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "public, max-age=60"
    return response


@app.exception_handler(404)
async def custom_404(request: Request, _exc):
    css_file, js_file = _find_assets()
    return templates.TemplateResponse("404.html", {
        "request": request,
        "page": "404",
        "canonical_path": request.url.path,
        "css_file": css_file,
        "js_file": js_file,
        "lightbox_data": [],
        "gallery_data": [],
        "active_session": None,
    }, status_code=404)


def _safe_file(base_dir: Path, file_path: str) -> Path | None:
    decoded = unquote(file_path)
    full_path = (base_dir / decoded).resolve()
    if not full_path.is_relative_to(base_dir.resolve()):
        return None
    if full_path.exists() and full_path.is_file():
        return full_path
    return None


def _file_response(full_path: Path) -> FileResponse:
    suffix = full_path.suffix.lower()
    media_type = EXTRA_MIME_TYPES.get(suffix) or guess_type(str(full_path))[0]
    return FileResponse(
        str(full_path),
        media_type=media_type,
        headers={"Cache-Control": "public, max-age=86400"},
    )


_assets_cache: tuple[str, str] | None = None
_assets_cache_mtime: float = 0.0

def _find_assets() -> tuple[str, str]:
    global _assets_cache, _assets_cache_mtime
    assets_dir = DIST_DIR / "assets"
    try:
        current_mtime = assets_dir.stat().st_mtime if assets_dir.exists() else 0.0
    except OSError:
        current_mtime = 0.0

    if _assets_cache is not None and current_mtime == _assets_cache_mtime:
        return _assets_cache

    css_file = ""
    js_file = ""
    if assets_dir.exists():
        for f in assets_dir.iterdir():
            if f.suffix == ".css" and not css_file:
                css_file = f.name
            elif f.suffix == ".js" and not js_file:
                js_file = f.name
    _assets_cache = (css_file, js_file)
    _assets_cache_mtime = current_mtime
    return css_file, js_file


# --- Page Routes ---

@app.get("/", response_class=HTMLResponse)
def page_index(request: Request):
    data = portfolio_service.build()
    daily_seed = date.today().toordinal()
    rng = random.Random(daily_seed)
    featured = list(data["featured"])
    rng.shuffle(featured)

    about_photo = data["about"]

    css_file, js_file = _find_assets()
    lightbox_data = [p.model_dump() for p in featured]

    return templates.TemplateResponse("index.html", {
        "request": request,
        "page": "index",
        "canonical_path": "/",
        "css_file": css_file,
        "js_file": js_file,
        "about_photo": about_photo.model_dump() if about_photo else {"thumb": "", "title": "Александр Ахметов", "src": "", "description": "", "width": 0, "height": 0},
        "lightbox_data": lightbox_data,
        "gallery_data": [],
        "active_session": None,
    })


@app.get("/portfolio", response_class=HTMLResponse)
def page_portfolio_redirect(request: Request):
    return RedirectResponse(url="/portfolio/")


@app.get("/portfolio/", response_class=HTMLResponse)
def page_portfolio(request: Request, session: str | None = None):
    data = portfolio_service.build()
    sessions = data["sessions"]

    active_session = session

    css_file, js_file = _find_assets()

    if active_session:
        lightbox_data = []
        for s in sessions:
            if s["id"] == active_session:
                lightbox_data = [p.model_dump() for p in s["photos"]]
                break
    else:
        lightbox_data = [p.model_dump() for p in data["gallery"]]

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
        "css_file": css_file,
        "js_file": js_file,
        "sessions": [{"id": s["id"], "title": s["title"]} for s in sessions],
        "active_session": active_session,
        "lightbox_data": lightbox_data,
        "gallery_data": gallery_data,
    })


@app.get("/reviews", response_class=HTMLResponse)
def page_reviews_redirect(request: Request):
    return RedirectResponse(url="/reviews/")


@app.get("/reviews/", response_class=HTMLResponse)
def page_reviews(request: Request):
    reviews = portfolio_service.load_reviews()
    css_file, js_file = _find_assets()

    avg_rating = round(sum(r["rating"] for r in reviews if r.get("rating")) / max(len([r for r in reviews if r.get("rating")]), 1), 1)

    return templates.TemplateResponse("reviews.html", {
        "request": request,
        "page": "reviews",
        "canonical_path": "/reviews/",
        "css_file": css_file,
        "js_file": js_file,
        "reviews": reviews,
        "avg_rating": avg_rating,
        "lightbox_data": [],
        "gallery_data": [],
        "active_session": None,
    })


@app.get("/sitemap.xml", response_class=Response)
def sitemap():
    data = portfolio_service.build()
    sessions = data["sessions"]
    today = date.today().isoformat()

    urls = [
        {"loc": "https://ekb.photographs.gs/", "lastmod": today, "changefreq": "weekly", "priority": "1.0"},
        {"loc": "https://ekb.photographs.gs/portfolio/", "lastmod": today, "changefreq": "weekly", "priority": "0.8"},
    ]

    for s in sessions:
        urls.append({
            "loc": f"https://ekb.photographs.gs/portfolio/?session={s['id']}",
            "lastmod": today,
            "changefreq": "monthly",
            "priority": "0.6",
        })

    urls.append({"loc": "https://ekb.photographs.gs/reviews/", "lastmod": today, "changefreq": "monthly", "priority": "0.6"})

    xml_parts = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for u in urls:
        xml_parts.append("  <url>")
        xml_parts.append(f"    <loc>{u['loc']}</loc>")
        xml_parts.append(f"    <lastmod>{u['lastmod']}</lastmod>")
        xml_parts.append(f"    <changefreq>{u['changefreq']}</changefreq>")
        xml_parts.append(f"    <priority>{u['priority']}</priority>")
        xml_parts.append("  </url>")
    xml_parts.append("</urlset>")

    return Response(content="\n".join(xml_parts), media_type="application/xml")


# --- API Routes ---

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


# --- Static File Routes ---

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


@app.get("/thumbs/{file_path:path}")
def serve_thumb(file_path: str):
    full_path = _safe_file(THUMBS_DIR, file_path)
    if full_path:
        return _file_response(full_path)
    raise HTTPException(status_code=404)


@app.get("/modern/{file_path:path}")
def serve_modern(file_path: str):
    full_path = _safe_file(MODERN_DIR, file_path)
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
