from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path
from pydantic import BaseModel
import json
import re

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

BASE_DIR = Path(__file__).resolve().parent.parent
PHOTOS_DIR = BASE_DIR / "public" / "photos"
METADATA_FILE = Path(__file__).resolve().parent / "photos.json"
DIST_DIR = BASE_DIR / "dist"

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".tiff", ".bmp", ".heic", ".avif"}

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


class PortfolioData(BaseModel):
    photos: list[Photo]


def prettify_filename(filename: str) -> str:
    name = Path(filename).stem
    name = name.replace("-", " ").replace("_", " ").replace("|", " ")
    name = re.sub(r"\s+", " ", name).strip()
    if name:
        name = name[0].upper() + name[1:]
    return name if name else filename


def get_image_dimensions(filepath: Path) -> tuple[int, int]:
    if not HAS_PIL:
        return 0, 0
    try:
        with Image.open(filepath) as img:
            return img.size
    except Exception:
        return 0, 0


def load_metadata() -> dict:
    if METADATA_FILE.exists():
        with open(METADATA_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def scan_photos() -> PortfolioData:
    metadata = load_metadata()
    photo_meta: dict[str, dict] = {}
    for entry in metadata.get("photos", []):
        photo_meta[entry.get("file", "")] = entry

    photos: list[Photo] = []

    if not PHOTOS_DIR.exists():
        return PortfolioData(photos=photos)

    all_image_files = sorted(
        [
            f
            for f in PHOTOS_DIR.rglob("*")
            if f.is_file()
            and f.suffix.lower() in IMAGE_EXTENSIONS
            and not f.name.startswith(".")
        ]
    )

    seen_paths: set[str] = set()

    for img_file in all_image_files:
        relative_path = str(img_file.relative_to(PHOTOS_DIR))
        src_path = f"/photos/{relative_path}"

        if relative_path in seen_paths:
            continue
        seen_paths.add(relative_path)

        meta = photo_meta.get(relative_path)

        title = meta.get("title", prettify_filename(img_file.name)) if meta else prettify_filename(img_file.name)
        description = meta.get("description", "") if meta else ""

        w, h = 0, 0
        if not img_file.name.startswith("http"):
            w, h = get_image_dimensions(img_file)

        photos.append(
            Photo(
                src=src_path,
                thumb=src_path,
                title=title,
                description=description,
                width=w,
                height=h,
            )
        )

    for entry in metadata.get("photos", []):
        file_val = entry.get("file", "")
        if not file_val or not file_val.startswith("http"):
            continue

        w, h = 0, 0
        size_match = re.search(r"/(\d+)/(\d+)$", file_val)
        if size_match:
            w, h = int(size_match.group(1)), int(size_match.group(2))

        photos.append(
            Photo(
                src=entry.get("src", file_val),
                thumb=entry.get("thumb", entry.get("src", file_val)),
                title=entry.get("title", ""),
                description=entry.get("description", ""),
                width=entry.get("width", w),
                height=entry.get("height", h),
            )
        )

    return PortfolioData(photos=photos)


@app.get("/api/photos", response_model=PortfolioData)
def get_photos():
    return scan_photos()


if PHOTOS_DIR.exists():
    app.mount("/photos", StaticFiles(directory=str(PHOTOS_DIR)), name="photos")

if DIST_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(DIST_DIR / "assets")), name="assets")

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        file_path = DIST_DIR / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(DIST_DIR / "index.html"))
