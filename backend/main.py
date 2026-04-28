from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pathlib import Path
from pydantic import BaseModel
from urllib.parse import unquote
import json
import re
import hashlib
import time

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

THUMB_MAX_W = 600
THUMB_QUALITY = 80

FAVOURITES_DIR = PHOTOS_DIR / "Favourites"
GALLERY_DIR = PHOTOS_DIR / "Gallery"
ABOUT_DIR = PHOTOS_DIR / "About me"

SCAN_DIRS = [FAVOURITES_DIR, GALLERY_DIR, ABOUT_DIR]

app = FastAPI(title="Photo Portfolio API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


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


_portfolio_cache: PortfolioData | None = None
_folder_snapshot: dict[str, list[tuple[str, float]]] | None = None
_metadata_mtime: float = 0.0
_dim_cache: dict[str, dict] = {}


def prettify_filename(filename: str) -> str:
    name = Path(filename).stem
    name = name.replace("-", " ").replace("_", " ").replace("|", " ")
    name = re.sub(r"\s+", " ", name).strip()
    if name:
        name = name[0].upper() + name[1:]
    return name if name else filename


def _load_dim_cache() -> dict[str, dict]:
    if DIMENSIONS_CACHE_FILE.exists():
        try:
            with open(DIMENSIONS_CACHE_FILE, "r") as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def _save_dim_cache(cache: dict[str, dict]):
    THUMBS_DIR.mkdir(parents=True, exist_ok=True)
    try:
        with open(DIMENSIONS_CACHE_FILE, "w") as f:
            json.dump(cache, f)
    except Exception:
        pass


def get_image_dimensions(filepath: Path) -> tuple[int, int]:
    rel = str(filepath.relative_to(PHOTOS_DIR))
    try:
        mtime = filepath.stat().st_mtime
    except OSError:
        if HAS_PIL:
            try:
                with Image.open(filepath) as img:
                    return img.size
            except Exception:
                pass
        return 0, 0

    cached = _dim_cache.get(rel)
    if cached and cached.get("mtime") == mtime:
        return cached["width"], cached["height"]

    if not HAS_PIL:
        return 0, 0

    try:
        with Image.open(filepath) as img:
            w, h = img.size
            _dim_cache[rel] = {"width": w, "height": h, "mtime": mtime}
            return w, h
    except Exception:
        return 0, 0


def thumb_path_for(original: Path) -> Path:
    rel = original.relative_to(PHOTOS_DIR)
    parts = list(rel.parts)
    safe_name = hashlib.sha256(parts[-1].encode()).hexdigest()[:16] + Path(parts[-1]).suffix.lower()
    parts[-1] = safe_name
    return THUMBS_DIR.joinpath(*parts)


def ensure_thumb(original: Path) -> Path:
    thumb = thumb_path_for(original)
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


def load_metadata() -> dict:
    if METADATA_FILE.exists():
        try:
            with open(METADATA_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def _take_folder_snapshot() -> dict[str, list[tuple[str, float]]]:
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


def _snapshot_changed(a: dict, b: dict) -> bool:
    if a.keys() != b.keys():
        return True
    for k in a:
        if a[k] != b[k]:
            return True
    return False


def scan_folder(folder: Path, photo_meta: dict[str, dict]) -> list[Photo]:
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

        thumb = ensure_thumb(img_file)
        if thumb.is_relative_to(THUMBS_DIR):
            thumb_rel = str(thumb.relative_to(THUMBS_DIR))
            thumb_path_str = f"/thumbs/{thumb_rel}"
        else:
            thumb_path_str = src_path

        meta = photo_meta.get(relative_path)
        title = meta.get("title", prettify_filename(img_file.name)) if meta else prettify_filename(img_file.name)
        description = meta.get("description", "") if meta else ""

        w, h = get_image_dimensions(img_file)

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


def get_about_photo(photo_meta: dict[str, dict]) -> Photo | None:
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

    thumb = ensure_thumb(img_file)
    if thumb.is_relative_to(THUMBS_DIR):
        thumb_rel = str(thumb.relative_to(THUMBS_DIR))
        thumb_path_str = f"/thumbs/{thumb_rel}"
    else:
        thumb_path_str = src_path

    meta = photo_meta.get(relative_path)
    title = meta.get("title", "Александр Ахметов") if meta else "Александр Ахметов"
    description = meta.get("description", "Портретный фотограф") if meta else "Портретный фотограф"

    w, h = get_image_dimensions(img_file)

    return Photo(
        src=src_path,
        thumb=thumb_path_str,
        title=title,
        description=description,
        width=w,
        height=h,
    )


def _build_portfolio() -> PortfolioData:
    global _portfolio_cache, _folder_snapshot, _metadata_mtime, _dim_cache

    current_snapshot = _take_folder_snapshot()

    try:
        current_meta_mtime = METADATA_FILE.stat().st_mtime if METADATA_FILE.exists() else 0.0
    except OSError:
        current_meta_mtime = 0.0

    if (
        _portfolio_cache is not None
        and _folder_snapshot is not None
        and not _snapshot_changed(current_snapshot, _folder_snapshot)
        and current_meta_mtime == _metadata_mtime
    ):
        return _portfolio_cache

    _folder_snapshot = current_snapshot
    _metadata_mtime = current_meta_mtime
    _dim_cache = _load_dim_cache()

    metadata = load_metadata()
    photo_meta: dict[str, dict] = {}
    for entry in metadata.get("photos", []):
        photo_meta[entry.get("file", "")] = entry

    featured = scan_folder(FAVOURITES_DIR, photo_meta)
    gallery = scan_folder(GALLERY_DIR, photo_meta)
    about = AboutData(photo=get_about_photo(photo_meta))

    _portfolio_cache = PortfolioData(featured=featured, gallery=gallery, about=about)
    _save_dim_cache(_dim_cache)

    return _portfolio_cache


@app.get("/api/portfolio", response_model=PortfolioData)
def get_portfolio():
    return _build_portfolio()


@app.get("/photos/{file_path:path}")
def serve_photo(file_path: str):
    decoded = unquote(file_path)
    full_path = (PHOTOS_DIR / decoded).resolve()

    if not str(full_path).startswith(str(PHOTOS_DIR.resolve())):
        return FileResponse(str(DIST_DIR / "index.html"))

    if full_path.exists() and full_path.is_file():
        return FileResponse(str(full_path))

    return FileResponse(str(DIST_DIR / "index.html"))


@app.get("/thumbs/{file_path:path}")
def serve_thumb(file_path: str):
    decoded = unquote(file_path)
    full_path = (THUMBS_DIR / decoded).resolve()

    if not str(full_path).startswith(str(THUMBS_DIR.resolve())):
        return FileResponse(str(DIST_DIR / "index.html"))

    if full_path.exists() and full_path.is_file():
        return FileResponse(str(full_path))

    return FileResponse(str(DIST_DIR / "index.html"))


@app.get("/{full_path:path}")
def serve_spa(full_path: str):
    if not DIST_DIR.exists():
        return FileResponse(str(DIST_DIR / "index.html"))

    decoded = unquote(full_path)
    file_path = DIST_DIR / decoded

    if file_path.exists() and file_path.is_file():
        return FileResponse(str(file_path))

    return FileResponse(str(DIST_DIR / "index.html"))
