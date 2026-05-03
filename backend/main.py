from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
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

BASE_DIR = Path(__file__).resolve().parent.parent
PHOTOS_DIR = BASE_DIR / "public" / "photos"
METADATA_FILE = Path(__file__).resolve().parent / "photos.json"
DIST_DIR = BASE_DIR / "dist"
THUMBS_DIR = BASE_DIR / "public" / "thumbs"
DIMENSIONS_CACHE_FILE = THUMBS_DIR / ".dimensions.json"

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".tiff", ".bmp", ".heic", ".avif"}

THUMB_MAX_W = 1200
THUMB_QUALITY = 80

FAVOURITES_DIR = PHOTOS_DIR / "Favourites"
GALLERY_DIR = PHOTOS_DIR / "Gallery"
ABOUT_DIR = PHOTOS_DIR / "About me"

SCAN_DIRS = [FAVOURITES_DIR, GALLERY_DIR, ABOUT_DIR]

EXTRA_MIME_TYPES = {
    ".heic": "image/heic",
    ".heif": "image/heic",
    ".avif": "image/avif",
    ".webp": "image/webp",
}


class Photo(BaseModel):
    src: str
    thumb: str
    title: str
    description: str
    width: int = 0
    height: int = 0


class AboutData(BaseModel):
    photo: Photo | None = None


class PortfolioData(BaseModel):
    featured: list[Photo]
    gallery: list[Photo]
    about: AboutData = AboutData()


def prettify_filename(filename: str) -> str:
    name = Path(filename).stem
    parts = [p.strip() for p in name.split("|") if p.strip()]
    date_str = parts[0] if parts else ""
    is_bw = any("b&w" in p.lower() or "bw" in p.lower() for p in parts)
    num = parts[-1] if len(parts) > 1 else ""

    date_fmt = ""
    if date_str and re.match(r"\d{2}-\d{2}-\d{4}", date_str):
        d, m, y = date_str.split("-")
        months = {
            "01": "января", "02": "февраля", "03": "марта",
            "04": "апреля", "05": "мая", "06": "июня",
            "07": "июля", "08": "августа", "09": "сентября",
            "10": "октября", "11": "ноября", "12": "декабря",
        }
        date_fmt = f"{int(d)} {months.get(m, m)} {y}"

    title_parts = []
    if date_fmt:
        title_parts.append(date_fmt)
    title_parts.append("Чёрно-белый портрет" if is_bw else "Портрет")
    if num:
        title_parts.append(f"№{num}")

    return ", ".join(title_parts) if title_parts else filename


class PortfolioService:
    def __init__(self):
        self._cache: PortfolioData | None = None
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
        for d in SCAN_DIRS:
            if not d.exists():
                snapshot[str(d)] = []
                continue
            entries = []
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

    def scan_folder(self, folder: Path, photo_meta: dict[str, dict]) -> list[Photo]:
        if not folder.exists():
            return []

        photos: list[Photo] = []
        image_files = sorted(
            [
                f
                for f in folder.iterdir()
                if f.is_file()
                and f.suffix.lower() in IMAGE_EXTENSIONS
                and not f.name.startswith(".")
            ]
        )

        for img_file in image_files:
            relative_path = str(img_file.relative_to(PHOTOS_DIR))
            src_path = f"/photos/{relative_path}"

            thumb = self.ensure_thumb(img_file)
            if thumb.is_relative_to(THUMBS_DIR):
                thumb_rel = str(thumb.relative_to(THUMBS_DIR))
                thumb_path_str = f"/thumbs/{thumb_rel}"
            else:
                thumb_path_str = src_path

            meta = photo_meta.get(relative_path)
            title = meta.get("title", prettify_filename(img_file.name)) if meta else prettify_filename(img_file.name)
            description = meta.get("description", "") if meta else ""

            w, h = self.get_dimensions(img_file)

            photos.append(
                Photo(
                    src=src_path,
                    thumb=thumb_path_str,
                    title=title,
                    description=description,
                    width=w,
                    height=h,
                )
            )

        return photos

    def get_about_photo(self, photo_meta: dict[str, dict]) -> Photo | None:
        if not ABOUT_DIR.exists():
            return None

        image_files = sorted(
            [
                f
                for f in ABOUT_DIR.iterdir()
                if f.is_file()
                and f.suffix.lower() in IMAGE_EXTENSIONS
                and not f.name.startswith(".")
            ]
        )

        if not image_files:
            return None

        img_file = image_files[0]
        relative_path = str(img_file.relative_to(PHOTOS_DIR))
        src_path = f"/photos/{relative_path}"

        thumb = self.ensure_thumb(img_file)
        if thumb.is_relative_to(THUMBS_DIR):
            thumb_rel = str(thumb.relative_to(THUMBS_DIR))
            thumb_path_str = f"/thumbs/{thumb_rel}"
        else:
            thumb_path_str = src_path

        meta = photo_meta.get(relative_path)
        title = meta.get("title", "Александр Ахметов") if meta else "Александр Ахметов"
        description = meta.get("description", "Портретный фотограф") if meta else "Портретный фотограф"

        w, h = self.get_dimensions(img_file)

        return Photo(
            src=src_path,
            thumb=thumb_path_str,
            title=title,
            description=description,
            width=w,
            height=h,
        )

    def build(self) -> PortfolioData:
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
        gallery = self.scan_folder(GALLERY_DIR, photo_meta)
        about = AboutData(photo=self.get_about_photo(photo_meta))

        self._cache = PortfolioData(featured=featured, gallery=gallery, about=about)
        self._save_dim_cache()

        return self._cache


portfolio_service = PortfolioService()

app = FastAPI(title="Photo Portfolio API")

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


@app.get("/api/portfolio", response_model=PortfolioData)
def get_portfolio():
    data = portfolio_service.build()
    featured = list(data.featured)
    gallery = list(data.gallery)
    daily_seed = date.today().toordinal()
    rng = random.Random(daily_seed)
    rng.shuffle(featured)
    rng.shuffle(gallery)
    return PortfolioData(featured=featured, gallery=gallery, about=data.about)


@app.get("/photos/{file_path:path}")
def serve_photo(file_path: str):
    full_path = _safe_file(PHOTOS_DIR, file_path)
    if full_path:
        return _file_response(full_path)
    return FileResponse(str(DIST_DIR / "index.html"))


@app.get("/thumbs/{file_path:path}")
def serve_thumb(file_path: str):
    full_path = _safe_file(THUMBS_DIR, file_path)
    if full_path:
        return _file_response(full_path)
    return FileResponse(str(DIST_DIR / "index.html"))


@app.get("/{full_path:path}")
def serve_spa(full_path: str):
    if not DIST_DIR.exists():
        return FileResponse(str(DIST_DIR / "index.html"))

    decoded = unquote(full_path)
    file_path = DIST_DIR / decoded

    if file_path.exists() and file_path.is_file():
        return _file_response(file_path)

    return FileResponse(str(DIST_DIR / "index.html"))
