from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
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
import time
import hashlib
import threading
from datetime import date

# --- Опциональные зависимости ---
# Pillow может быть не установлена (Docker без неё).
# pillow-avif-plugin — отдельный пакет для AVIF.
# Без них: миниатюры и современные форматы не генерируются,
# отдаются оригиналы.
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


# ============================================================
# 1. КОНФИГУРАЦИЯ — пути и константы
#
# Все пути — абсолютные (resolve()), чтобы не зависеть от cwd.
# BASE_DIR = корень проекта (там где Dockerfile, package.json).
# ============================================================

BASE_DIR = Path(__file__).resolve().parent.parent       # /Users/.../portfolio
PHOTOS_DIR = BASE_DIR / "public" / "photos"             # Оригинальные фото
METADATA_FILE = Path(__file__).resolve().parent / "photos.json"  # Заголовки/описания фото
REVIEWS_FILE = Path(__file__).resolve().parent / "reviews.json"  # Отзывы клиентов
DIST_DIR = BASE_DIR / "dist"                            # Собранный фронтенд (CSS/JS)
THUMBS_DIR = BASE_DIR / "public" / "thumbs"             # JPEG-миниатюры
MODERN_DIR = BASE_DIR / "public" / "modern"             # WebP + AVIF миниатюры
DIMENSIONS_CACHE_FILE = THUMBS_DIR / ".dimensions.json" # Кеш размеров фото (width/height)
TEMPLATES_DIR = Path(__file__).resolve().parent / "templates"  # Jinja2-шаблоны

# Поддерживаемые расширения фото.
# Исключаем RAW (.cr2, .nef) — слишком большие, не нужны для веба.
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".tiff", ".bmp", ".heic", ".avif"}

# Параметры миниатюр
THUMB_MAX_W = 1200              # Максимальная ширина миниатюры: 1200px — достаточно для ретина-экранов
THUMB_QUALITY = 80              # JPEG quality: 80 — баланс качества и размера
DISPLAY_MAX_W = 1920            # Максимальная ширина для лайтбокса: 1920px — достаточно для Full HD
DISPLAY_QUALITY = 85            # JPEG quality для лайтбокса: 85 — хорошее качество при малом размере

# Папки фото по назначению
FAVOURITES_DIR = PHOTOS_DIR / "Favourites"   # Лучшие фото → секция featured на главной
GALLERY_DIR = PHOTOS_DIR / "Gallery"         # Портфолио → подпапки = съёмки
ABOUT_DIR = PHOTOS_DIR / "About me"          # Фото фотографа → секция «Обо мне»

# MIME-типы для нестандартных расширений.
# mimetypes.guess_type() не знает HEIC/AVIF — добавляем вручную.
EXTRA_MIME_TYPES = {
    ".heic": "image/heic",
    ".heif": "image/heic",
    ".avif": "image/avif",
    ".webp": "image/webp",
}


# ============================================================
# 2. МОДЕЛЬ PHOTO — данные одного фото
#
# Используется Pydantic BaseModel — автоматически валидирует
# типы и генерирует JSON через .model_dump().
# Передаётся в шаблоны и API-ответы.
# ============================================================
class Photo(BaseModel):
    src: str              # URL оригинала: "/photos/Gallery/19-04-2026.../photo.jpg"
    display_src: str = "" # URL оптимизированной версии для лайтбокса: "/modern/display/36a8bf075d48adff.jpg" (1920px, quality 85)
    thumb: str            # URL JPEG-миниатюры: "/thumbs/Favourites/36a8bf075d48adff.jpg"
    thumb_webp: str = "" # URL WebP-миниатюры: "/modern/Favourites/36a8bf075d48adff.webp" (пустая = нет)
    thumb_avif: str = "" # URL AVIF-миниатюры: "/modern/Favourites/36a8bf075d48adff.avif" (пустая = нет)
    title: str            # Заголовок: "Портрет, №1" или из photos.json
    description: str      # Описание: "" если нет
    width: int = 0        # Ширина оригинала в px (0 = не удалось определить)
    height: int = 0       # Высота оригинала в px


# ============================================================
# 3. УТИЛИТЫ — красивые имена из файлов
#
# Имена фото-файлов: "|19-04-2026| B&W |-15.jpg"
# Имена папок-съёмок: "19-04-2026 Dmitriy Potapov"
# Эти функции превращают их в человекочитаемые названия.
# ============================================================

# Словарь месяцев для русских дат.
# Ключи = двузначные номера ("01"-"12").
# Используется в prettify_filename и prettify_session_name.
MONTHS_RU = {
    "01": "января", "02": "февраля", "03": "марта",
    "04": "апреля", "05": "мая", "06": "июня",
    "07": "июля", "08": "августа", "09": "сентября",
    "10": "октября", "11": "ноября", "12": "декабря",
}


def prettify_filename(filename: str) -> str:
    """Превращает имя файла в читаемый заголовок.

    Примеры:
      "|19-04-2026| B&W |-15.jpg" → "Чёрно-белый портрет, №15"
      "|2-05-2026|-48.jpg"          → "Портрет, №48"
      "photo.jpg"                   → "photo" (fallback)

    Алгоритм:
    1. Разбиваем имя по "|" — получаем части: дата, тип(B&W), номер
    2. Дата — отбрасываем (она есть в имени съёмки, не нужна в заголовке)
    3. B&W → "Чёрно-белый портрет", иначе → "Портрет"
    4. Номер → "№N"
    """
    name = Path(filename).stem                  # Убираем расширение (.jpg)
    parts = [p.strip() for p in name.split("|") if p.strip()]  # ["19-04-2026", "B&W", "-15"]
    date_str = parts[0] if parts else ""        # Первая часть = дата
    is_bw = any("b&w" in p.lower() or "bw" in p.lower() for p in parts)  # Чёрно-белое?
    num = parts[-1].lstrip("-") if len(parts) > 1 else ""  # Последняя часть = номер (убираем ведущее "-")

    # Дата — не используется в заголовке (она в имени съёмки),
    # но код оставлен для возможного будущего использования
    date_fmt = ""
    if date_str and re.match(r"\d{1,2}-\d{2}-\d{2,4}$", date_str):
        d, m, y = date_str.split("-")
        if len(y) == 2:
            y = "20" + y                       # "26" → "2026"
        date_fmt = f"{int(d)} {MONTHS_RU.get(m, m)} {y}"

    title_parts = []
    title_parts.append("Чёрно-белый портрет" if is_bw else "Портрет")
    if num:
        title_parts.append(f"№{num}")

    return ", ".join(title_parts) if title_parts else "Фотография"  # Fallback: если имя не распарсилось


def prettify_session_name(dirname: str) -> str:
    """Превращает имя папки-съёмки в читаемое название.

    Примеры:
      "19-04-2026 Dmitriy Potapov" → "Dmitriy Potapov — 19 апреля 2026"
      "2-05-26 Maxim Yuzhin"       → "Maxim Yuzhin — 5 мая 2026"
      "some-folder"                → "some folder" (fallback: дефисы → пробелы)

    Формат: ИМЯ — ДАТА. Имя вперёд, дата сзади —
    так в фильтрах галереи имя сразу видно.
    """
    m = re.match(r"(\d{1,2})-(\d{2})-(\d{2,4})\s*(.*)", dirname)
    if m:
        d, mo, y, rest = m.group(1), m.group(2), m.group(3), m.group(4).strip()
        if len(y) == 2:
            y = "20" + y                       # "26" → "2026"
        date_str = f"{int(d)} {MONTHS_RU.get(mo, mo)} {y}"  # "19 апреля 2026"
    if rest:
        name = rest # "Dmitriy Potapov" (без даты)
    else:
        name = date_str # Только дата — нет имени клиента
    return name
    # Fallback: не похоже на дату — просто заменяем дефисы на пробелы
    return dirname.replace("-", " ").replace("_", " ")


# ============================================================
# 4. PORTFOLIO SERVICE — ядро приложения
#
# Единственный экземпляр (portfolio_service) живёт всё время
# работы сервера. Отвечает за:
# - Сканирование папок с фото
# - Кеширование результатов (инвалидация по mtime)
# - Генерацию миниатюр (JPEG)
# - Генерацию современных форматов (WebP, AVIF)
# - Определение размеров фото
# - Загрузку метаданных и отзывов
#
# Кеш: build() проверяет не изменились ли файлы (снапшот).
# Если нет — возвращает закешированный результат за 0мс.
# Если да — пересканирует, генерирует миниатюры.
# ============================================================
class PortfolioService:
    def __init__(self):
        self._cache: dict | None = None                            # Закешированный результат build()
        self._snapshot: dict[str, list[tuple[str, float]]] | None = None  # Снапшот файлов + mtime
        self._meta_mtime: float = 0.0                              # mtime photos.json при последнем build()
        self._dim_cache: dict[str, dict] = {}                      # Кеш размеров фото: {path: {width, height, mtime}}

    # --- Кеш размеров фото ---
    # Хранится в .dimensions.json рядом с миниатюрами.
    # При перезапуске сервера — загружается с диска,
    # не нужно заново открывать все фото через Pillow.
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

    # get_dimensions — возвращает (width, height) фото.
    # Кеширует в памяти + на диске. Инвалидируется по mtime.
    # Без Pillow — возвращает (0, 0) — JS будет использовать дефолт 3:4.
    def get_dimensions(self, filepath: Path) -> tuple[int, int]:
        if not HAS_PIL:
            return 0, 0

        try:
            mtime = filepath.stat().st_mtime   # Время модификации файла
        except OSError:
            return 0, 0

        rel = str(filepath.relative_to(PHOTOS_DIR))
        cached = self._dim_cache.get(rel)
        if cached and cached.get("mtime") == mtime:  # Файл не изменился — берём из кеша
            return cached["width"], cached["height"]

        try:
            with Image.open(filepath) as img:
                w, h = img.size
                self._dim_cache[rel] = {"width": w, "height": h, "mtime": mtime}
                return w, h
        except Exception:
            return 0, 0

    # thumb_path_for — вычисляет путь к миниатюре для данного оригинала.
    # Имя файла = SHA256[:16] + .jpg — безопасное, без спецсимволов.
    # Пример: "|19-04-2026| B&W |-15.jpg" → "36a8bf075d48adff.jpg"
    def thumb_path_for(self, original: Path) -> Path:
        rel = original.relative_to(PHOTOS_DIR)
        parts = list(rel.parts)                # ["Gallery", "19-04-2026 ...", "|19-04-2026| B&W |-15.jpg"]
        safe_name = hashlib.sha256(parts[-1].encode()).hexdigest()[:16] + Path(parts[-1]).suffix.lower()
        parts[-1] = safe_name                  # ["Gallery", "19-04-2026 ...", "36a8bf075d48adff.jpg"]
        return THUMBS_DIR.joinpath(*parts)

    # ensure_thumb — гарантирует что миниатюра существует.
    # Если уже есть и новее оригинала — отдаёт готовую.
    # Если нет — генерирует через Pillow и сохраняет.
    # Без Pillow — возвращает путь к оригиналу (без миниатюры).
    def ensure_thumb(self, original: Path) -> Path:
        thumb = self.thumb_path_for(original)
        if thumb.exists():
            try:
                mtime_orig = original.stat().st_mtime
                mtime_thumb = thumb.stat().st_mtime
                if mtime_thumb >= mtime_orig:    # Миниатюра свежее — не перегенерируем
                    return thumb
            except OSError:
                pass

        if not HAS_PIL:
            return original                     # Fallback: без Pillow — оригинал как есть

        try:
            thumb.parent.mkdir(parents=True, exist_ok=True)
            with Image.open(original) as img:
                img.thumbnail((THUMB_MAX_W, THUMB_MAX_W * 3), Image.Resampling.LANCZOS)  # Max 1200×3600, LANCZOS = лучший даунсэмплинг
                if img.mode in ("RGBA", "P"):   # RGBA (прозрачность) или P (палитра) → RGB, т.к. JPEG не поддерживает
                    img = img.convert("RGB")
                img.save(str(thumb), "JPEG", quality=THUMB_QUALITY, progressive=True)  # Progressive = загружается сверху-вниз
            return thumb
        except Exception:
            return original

    # _modern_path_for — путь к WebP/AVIF версии миниатюры.
    # Берёт путь миниатюры, заменяет расширение на .webp/.avif.
    def _modern_path_for(self, thumb: Path, ext: str) -> Path:
        rel = thumb.relative_to(THUMBS_DIR)
        parts = list(rel.parts)
        stem = Path(parts[-1]).stem             # "36a8bf075d48adff" без .jpg
        parts[-1] = stem + ext                  # "36a8bf075d48adff.webp"
        return MODERN_DIR.joinpath(*parts)

    # ensure_modern — гарантирует что WebP и AVIF версии миниатюры существуют.
    # Возвращает (webp_url, avif_url) — пустые строки если не удалось.
    # Порядок: сначала WebP (быстрее), потом AVIF (медленнее).
    # Инвалидация: если миниатюра новее WebP/AVIF — перегенерируем.
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

        # --- WebP ---
        if webp_path.exists():
            try:
                if webp_path.stat().st_mtime >= mtime_thumb:  # Свежее — отдаём
                    webp_url = f"/modern/{webp_path.relative_to(MODERN_DIR)}"
            except OSError:
                pass

        if not webp_url:                        # Устарел или нет — генерируем
            try:
                webp_path.parent.mkdir(parents=True, exist_ok=True)
                with Image.open(thumb) as img:
                    if img.mode in ("RGBA", "P"):
                        img = img.convert("RGB")
                    img.save(str(webp_path), "WEBP", quality=80, method=4)  # method=4 — баланс скорость/сжатие
                webp_url = f"/modern/{webp_path.relative_to(MODERN_DIR)}"
            except Exception:
                pass

        # --- AVIF --- (только если pillow-avif-plugin установлен)
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
                    img.save(str(avif_path), "AVIF", quality=75, speed=4)  # speed=4 — быстрое кодирование
                avif_url = f"/modern/{avif_path.relative_to(MODERN_DIR)}"
            except Exception:
                pass

        return webp_url, avif_url

    # ensure_display — гарантирует что display-версия (1920px) существует.
    # Display-версия — JPEG, ресайзнутый до DISPLAY_MAX_W по большей стороне,
    # quality DISPLAY_QUALITY. Используется в лайтбоксе вместо полного оригинала.
    # Это экономит трафик посетителей и место на диске (20MB → ~300-500KB).
    # Сохраняется в /modern/display/{sha256[:16]}_d.jpg
    def ensure_display(self, original: Path) -> Path:
        rel = original.relative_to(PHOTOS_DIR)
        parts = list(rel.parts)
        safe_name = hashlib.sha256(parts[-1].encode()).hexdigest()[:16] + "_d.jpg"
        display_path = MODERN_DIR / "display" / safe_name

        if display_path.exists():
            try:
                mtime_orig = original.stat().st_mtime
                mtime_disp = display_path.stat().st_mtime
                if mtime_disp >= mtime_orig:
                    return display_path
            except OSError:
                pass

        if not HAS_PIL:
            return original

        try:
            display_path.parent.mkdir(parents=True, exist_ok=True)
            with Image.open(original) as img:
                w, h = img.size
                if w > DISPLAY_MAX_W or h > DISPLAY_MAX_W:
                    ratio = min(DISPLAY_MAX_W / w, DISPLAY_MAX_W / h)
                    new_w = int(w * ratio)
                    new_h = int(h * ratio)
                    img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
                if img.mode in ("RGBA", "P"):
                    img = img.convert("RGB")
                img.save(str(display_path), "JPEG", quality=DISPLAY_QUALITY, progressive=True)
            return display_path
        except Exception:
            return original

    # load_metadata — загружает photos.json (заголовки и описания).
    # Если файл пуст или не существует — пустой словарь.
    # Без записей — заголовок = prettify_filename(), описание = "".
    def load_metadata(self) -> dict:
        if METADATA_FILE.exists():
            try:
                with open(METADATA_FILE, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        return {}

    # _take_snapshot — «фотография» текущего состояния папок с фото.
    # Для каждой папки: список (путь_файла, mtime).
    # Используется для инвалидации кеша: если снапшот изменился —
    # значит добавились/удалились/изменились фото → нужно пересканировать.
    def _take_snapshot(self) -> dict[str, list[tuple[str, float]]]:
        snapshot = {}
        scan_dirs = [FAVOURITES_DIR, GALLERY_DIR, ABOUT_DIR]
        for d in scan_dirs:
            if not d.exists():
                snapshot[str(d)] = []
                continue
            entries = []
            if d == GALLERY_DIR:
                # Gallery — рекурсивный обход (подпапки = съёмки)
                for root, _dirs, files in d.walk():
                    for f in files:
                        fp = root / f
                        if fp.suffix.lower() in IMAGE_EXTENSIONS and not fp.name.startswith("."):
                            try:
                                entries.append((str(fp.relative_to(d)), fp.stat().st_mtime))
                            except OSError:
                                pass
            else:
                # Favourites, About me — только корень (без подпапок)
                for f in d.iterdir():
                    if f.is_file() and f.suffix.lower() in IMAGE_EXTENSIONS and not f.name.startswith("."):
                        try:
                            entries.append((f.name, f.stat().st_mtime))
                        except OSError:
                            pass
            entries.sort()                      # Сортировка для стабильного сравнения
            snapshot[str(d)] = entries
        return snapshot

    # _snapshot_changed — сравнивает два снапшота.
    # True = файлы изменились, кеш невалиден.
    @staticmethod
    def _snapshot_changed(a: dict, b: dict) -> bool:
        if a.keys() != b.keys():
            return True
        for k in a:
            if a[k] != b[k]:
                return True
        return False

    # _photo_from_file — создаёт Photo-объект из файла.
    # 1. Вычисляет пути: оригинал, миниатюра, WebP, AVIF
    # 2. Гарантирует миниатюру (ensure_thumb) и современные форматы (ensure_modern)
    # 3. Берёт заголовок/описание из photos.json или генерирует из имени
    # 4. Определяет размеры (get_dimensions)
    def _photo_from_file(self, img_file: Path, photo_meta: dict[str, dict]) -> Photo:
        relative_path = str(img_file.relative_to(PHOTOS_DIR))
        src_path = f"/photos/{relative_path}"   # URL оригинала

        thumb = self.ensure_thumb(img_file)
        if thumb.is_relative_to(THUMBS_DIR):    # Миниатюра создана — путь в /thumbs/
            thumb_rel = str(thumb.relative_to(THUMBS_DIR))
            thumb_path_str = f"/thumbs/{thumb_rel}"
        else:
            thumb_path_str = src_path            # Fallback: миниатюра = оригинал

        thumb_webp, thumb_avif = "", ""
        if thumb.is_relative_to(THUMBS_DIR):    # WebP/AVIF только если миниатюра создана
            thumb_webp, thumb_avif = self.ensure_modern(thumb)

        # Display-версия для лайтбокса (1920px, quality 85)
        display = self.ensure_display(img_file)
        display_src = ""
        if display.is_relative_to(MODERN_DIR):
            display_rel = str(display.relative_to(MODERN_DIR))
            display_src = f"/modern/{display_rel}"
        elif display != img_file:
            display_src = src_path

        meta = photo_meta.get(relative_path)    # Ищем запись в photos.json по пути
        title = meta.get("title", prettify_filename(img_file.name)) if meta else prettify_filename(img_file.name)
        description = meta.get("description", "") if meta else ""

        w, h = self.get_dimensions(img_file)

        return Photo(
            src=src_path,
            display_src=display_src,
            thumb=thumb_path_str,
            thumb_webp=thumb_webp,
            thumb_avif=thumb_avif,
            title=title,
            description=description,
            width=w,
            height=h,
        )

    # scan_folder — сканирует папку без подпапок (Favourites, About me).
    # Возвращает список Photo, отсортированный по имени файла.
    def scan_folder(self, folder: Path, photo_meta: dict[str, dict]) -> list[Photo]:
        if not folder.exists():
            return []

        image_files = sorted([                   # sorted() = стабильный порядок (по алфавиту)
            f for f in folder.iterdir()
            if f.is_file() and f.suffix.lower() in IMAGE_EXTENSIONS and not f.name.startswith(".")
        ])
        return [self._photo_from_file(f, photo_meta) for f in image_files]

    # scan_gallery_sessions — сканирует Gallery/ с подпапками-съёмками.
    # Возвращает (sessions, all_photos):
    # - sessions = [{id, title, photos}] — каждая съёмка
    # - all_photos = [Photo] — все фото всех съёмок (для «Все съёмки»)
    def scan_gallery_sessions(self, photo_meta: dict[str, dict]) -> tuple[list[dict], list[Photo]]:
        if not GALLERY_DIR.exists():
            return [], []

        sessions = []
        all_photos = []

        subdirs = sorted([                        # Съёмки = подпапки Gallery/, отсортированы
            d for d in GALLERY_DIR.iterdir()
            if d.is_dir() and not d.name.startswith(".")  # Скрываем .DS_Store и т.п.
        ])

        if not subdirs:
            # Нет подпапок — все фото в корне Gallery/ (старый формат)
            photos = self.scan_folder(GALLERY_DIR, photo_meta)
            if photos:
                sessions.append({"id": "all", "title": "Все фотографии", "photos": photos})
                all_photos.extend(photos)
            return sessions, all_photos

        for session_dir in subdirs:
            photos = self.scan_folder(session_dir, photo_meta)
            if photos:
                session_title = prettify_session_name(session_dir.name)  # "Dmitriy Potapov — 19 апреля 2026"
                sessions.append({
                    "id": session_dir.name,      # ID = имя папки ("19-04-2026 Dmitriy Potapov")
                    "title": session_title,
                    "photos": photos,
                })
                all_photos.extend(photos)

        return sessions, all_photos

    # get_about_photo — одно фото фотографа из "About me/".
    # Берёт первое по алфавиту. Если папка пуста — None.
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

    # load_reviews — загружает отзывы из reviews.json.
    # НЕ вызывает build() — лёгкая операция, можно вызывать отдельно.
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
            if not text:                             # Пустой текст — не показываем карточку
                continue
            reviews.append({
                "name": name,
                "text": text,
                "date": r.get("date", "").strip(),
                "rating": r.get("rating"),     # None если нет — позволяет фильтровать отзывы без рейтинга
            })
        return reviews

    # build — главная функция. Возвращает закешированные данные:
    # {featured, sessions, gallery, about}.
    #
    # Инвалидация кеша:
    # 1. Снапшот файлов изменился (добавили/удалили фото)
    # 2. photos.json изменился (mtime)
    # Если ничего не менялось — возвращает кеш за 0мс.
    #
    # Если кеш устарел, но старый кеш существует — возвращает старый
    # и запускает перестроение в фоновом потоке (threading).
    # Это предотвращает блокировку сервера на время генерации миниатюр.
    #
    # Первый запрос при холодном старте (кеша нет) — синхронный.
    # Последующие — мгновенные.
    def build(self) -> dict:
        current_snapshot = self._take_snapshot()

        try:
            current_meta_mtime = METADATA_FILE.stat().st_mtime if METADATA_FILE.exists() else 0.0
        except OSError:
            current_meta_mtime = 0.0

        # Проверяем кеш
        if (
            self._cache is not None
            and self._snapshot is not None
            and not self._snapshot_changed(current_snapshot, self._snapshot)
            and current_meta_mtime == self._meta_mtime
        ):
            return self._cache                  # Кеш валиден — возвращаем мгновенно

        # Кеш невалиден — обновляем снапшот
        self._snapshot = current_snapshot
        self._meta_mtime = current_meta_mtime

        # Если есть старый кеш — отдаём его и перестраиваем в фоне
        if self._cache is not None:
            thread = threading.Thread(target=self._rebuild, daemon=True)
            thread.start()
            return self._cache

        # Нет кеша вообще (холодный старт) — перестраиваем синхронно
        self._rebuild()
        return self._cache

    def _rebuild(self):
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


# ============================================================
# 5. FASTAPI-ПРИЛОЖЕНИЕ
# ============================================================

portfolio_service = PortfolioService()           # Единственный экземпляр — живёт всё время
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))


# --- Кастомный Jinja2-фильтр jsonsafe ---
# Экранирует строку для вставки в JSON-LD <script> блок.
# Jinja2 autoescape экранирует для HTML (→ &amp;), но внутри <script>
# нужен JSON-экранирующий формат (→ \"). Также экранируем </> → <\/>,
# чтобы браузер не закрыл </script> преждевременно.
def _jsonsafe(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)[1:-1]  # Оборачивает в "...", снимаем кавычки


templates.env.filters["jsonsafe"] = _jsonsafe

app = FastAPI(title="Photo Portfolio")

# GZip — сжимает HTML/JSON/CSS/JS ответы > 1000 байт.
# Снижает трафик в 3-5× для текстовых ответов.
# Ставится ПЕРЕД CORS — middleware работают LIFO (последний добавленный = первый в цепочке).
app.add_middleware(GZipMiddleware, minimum_size=1000)

# CORS — разрешаем запросы с этих источников.
# Нужен только если фронтенд на другом домене.
# Сейчас фронтенд = тот же сервер, но оставляем для
# localhost:5173 (Vite dev server).
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://ekb.photographs.gs",           # Продакшен
        "http://localhost:5173",                 # Vite dev server
        "http://127.0.0.1:5173",
    ],
    allow_methods=["GET"],
    allow_headers=["*"],
)


# Content-Security-Policy — базовая защита от XSS.
# script-src: 'self' + inline script (window.__PAGE__ и JSON-данные).
#   Хеш SHA-256 вычисляется от содержимого <script> в base.html.
# style-src: 'self' + Google Fonts + inline styles (lightbox zoom).
# font-src: Google Fonts.
# img-src: 'self' (фото, миниатюры) + data: (SVG иконки).
# connect-src: 'self' (API).
# form-action: Яндекс.Формы (ссылки для записи/отзывов).
# frame-ancestors: 'none' — сайт не встраивается в iframe.
@app.middleware("http")
async def csp_middleware(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/assets/") or request.url.path.endswith((".css", ".js")):
        return response  # Не добавляем CSP к статическим файлам — они не HTML
    csp = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline'; "
        "style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; "
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


# Cache-Control middleware — заголовки кеширования для браузера.
# API-ответы кешируются на 60с (часто не меняются).
# Статические файлы — 86400с (1 день) в _file_response().
@app.middleware("http")
async def cache_control_middleware(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "public, max-age=60"
    return response


# Rate Limiting — ограничивает запросы с одного IP.
# 60 запросов за 60 секунд — легитимный пользователь не упрётся,
# а DDoS-бот будет получать 429 Too Many Requests.
# Статика (/photos/, /thumbs/, /assets/) не ограничивается —
# она не нагружает сервер (нет шаблонов, нет Pillow).
_rate_limits: dict[str, list[float]] = {}
_RATE_LIMIT = 60
_RATE_WINDOW = 60

@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    path = request.url.path
    if path.startswith(("/assets/", "/photos/", "/thumbs/", "/modern/", "/favicon")):
        return await call_next(request)

    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        ip = forwarded.split(",")[0].strip()
    else:
        ip = request.client.host if request.client else "unknown"
    now = time.time()

    requests = _rate_limits.get(ip, [])
    requests = [t for t in requests if now - t < _RATE_WINDOW]

    if len(requests) >= _RATE_LIMIT:
        return Response("Too Many Requests", status_code=429, media_type="text/plain")

    requests.append(now)
    _rate_limits[ip] = requests

    # Очистка от устаревших IP — предотвращает утечку памяти
    if len(_rate_limits) > 10000:
        _rate_limits.clear()

    return await call_next(request)


# HTTPS-редирект — если nginx передаёт X-Forwarded-Proto: http,
# редиректит на https://. Безопасный fallback: если заголовка нет
# (nginx не настроен) — ничего не делает.
# Основной редирект должен быть в nginx:
#   if ($scheme = http) { return 301 https://$host$request_uri; }
@app.middleware("http")
async def https_redirect_middleware(request: Request, call_next):
    forwarded = request.headers.get("x-forwarded-proto")
    if forwarded and forwarded == "http":
        host = request.headers.get("host", "")
        return RedirectResponse(
            url=f"https://{host}{request.url.path}",
            status_code=301,
        )
    return await call_next(request)


# Кастомная 404 — вместо голого "Not Found" показывает
# красивую страницу с золотым «404» и ссылкой «На главную».
# Вызывается когда маршрут не найден (HTTPException(404)).
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
    }, status_code=404)


# Кастомная 500 — подавляет стек-трейс в продакшене.
# По умолчанию FastAPI/Starlette раскрывает детали ошибки —
# это полезно при разработке, но в проде утечка информации
# (имена файлов, структура кода, переменные окружения).
# Возвращаем простой текст без подробностей.
@app.exception_handler(Exception)
async def custom_500(request: Request, _exc):
    return Response("Internal Server Error", status_code=500, media_type="text/plain")


# ============================================================
# 6. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
# ============================================================

# _safe_file — безопасно разрешает путь к файлу.
# 1. Декодирует URL-кодировку (%20 → пробел)
# 2. Проверяет что путь внутри base_dir (защита от ../../etc/passwd)
# 3. Проверяет что файл существует
# Возвращает Path или None.
def _safe_file(base_dir: Path, file_path: str) -> Path | None:
    decoded = unquote(file_path)
    full_path = (base_dir / decoded).resolve()
    if not full_path.is_relative_to(base_dir.resolve()):  # Путь выходит за base_dir — атака
        return None
    if full_path.exists() and full_path.is_file():
        return full_path
    return None


# _file_response — отдаёт файл с правильным MIME-типом
# и Cache-Control: 1 день (статика редко меняется).
def _file_response(full_path: Path) -> FileResponse:
    suffix = full_path.suffix.lower()
    media_type = EXTRA_MIME_TYPES.get(suffix) or guess_type(str(full_path))[0]
    return FileResponse(
        str(full_path),
        media_type=media_type,
        headers={"Cache-Control": "public, max-age=86400"},  # 86400с = 24ч
    )


# _find_assets — находит имена CSS/JS файлов в dist/assets/.
# Vite добавляет хеш к именам: "index-C1Dxni3t.css".
# Поддерживает несколько чанков (code-splitting): все CSS и JS
# файлы собираются в списки. Кеширует + инвалидирует по mtime.
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
        return _assets_cache                      # Кеш валиден

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


# ============================================================
# 7. МАРШРУТЫ СТРАНИЦ — серверный рендеринг (SSR)
#
# Каждый маршрут рендерит Jinja2-шаблон с данными.
# Все шаблоны требуют одинаковый набор переменных
# (иначе Jinja2 выдаст ошибку UndefinedError).
# ============================================================

# --- Главная страница (/) ---
@app.get("/", response_class=HTMLResponse)
def page_index(request: Request):
    data = portfolio_service.build()
    # Featured-фото перемешиваем — но детерминированно:
    # seed = день года. Каждый день — новый порядок,
    # но в течение дня — одинаковый для всех пользователей.
    daily_seed = date.today().toordinal()
    rng = random.Random(daily_seed)
    featured = list(data["featured"])
    rng.shuffle(featured)

    about_photo = data["about"]

    css_files, js_files = _find_assets()
    lightbox_data = [p.model_dump() for p in featured]  # JSON-сериализация для JS

    return templates.TemplateResponse("index.html", {
        "request": request,                     # Обязателен для Jinja2
        "page": "index",                       # window.__PAGE__ в JS
        "canonical_path": "/",                 # <link rel=canonical>
        "css_files": css_files,
        "js_files": js_files,
        "about_photo": about_photo.model_dump() if about_photo else {"thumb": "", "title": "Александр Ахметов", "src": "", "description": "", "width": 0, "height": 0, "thumb_webp": "", "thumb_avif": ""},
        "lightbox_data": lightbox_data,         # Фото для лайтбокса featured
        "gallery_data": [],                    # Не нужно на главной
        "active_session": None,                # Не нужно на главной
    })


# --- Редирект /portfolio → /portfolio/ (со слешем) ---
# Поисковики считают /portfolio и /portfolio/ разными URL.
# Редирект гарантирует канонический URL со слешем.
@app.get("/portfolio", response_class=HTMLResponse)
def page_portfolio_redirect(request: Request):
    return RedirectResponse(url="/portfolio/")


# --- Страница портфолио (/portfolio/) ---
@app.get("/portfolio/", response_class=HTMLResponse)
def page_portfolio(request: Request, session: str | None = None):
    data = portfolio_service.build()
    sessions = data["sessions"]

    active_session = session                    # None = «Все съёмки», строка = ID съёмки

    css_files, js_files = _find_assets()

    # lightbox_data НЕ передаём на портфолио — JS сам устанавливает
    # список через initGallery() → setLightboxList(). Передача сюда
    # только раздувала HTML (gallery_data уже содержит все фото).

    # gallery_data — все съёмки со фото (для JS-галереи)
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
        "sessions": [{"id": s["id"], "title": s["title"]} for s in sessions],  # Для фильтров — без фото (лёгкий)
        "active_session": active_session,
        "lightbox_data": [],
        "gallery_data": gallery_data,
    })


# --- Редирект /reviews → /reviews/ ---
@app.get("/reviews", response_class=HTMLResponse)
def page_reviews_redirect(request: Request):
    return RedirectResponse(url="/reviews/")


# --- Страница отзывов (/reviews/) ---
@app.get("/reviews/", response_class=HTMLResponse)
def page_reviews(request: Request):
    reviews = portfolio_service.load_reviews()  # Не build() — лёгкая операция
    css_files, js_files = _find_assets()

    # Средний рейтинг для JSON-LD (AggregateRating).
    # max(..., 1) — защита от деления на 0 когда нет отзывов с рейтингом
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
    })


# --- robots.txt — указывает поисковикам на sitemap ---
@app.get("/robots.txt", response_class=Response)
def robots():
    return Response(
        "User-agent: *\nAllow: /\nSitemap: https://ekb.photographs.gs/sitemap.xml\n",
        media_type="text/plain",
    )


# ============================================================
# 8. SITEMAP — динамическая генерация
#
# Генерируется при каждом запросе (не статичный файл).
# Автоматически включает все съёмки как отдельные URL.
# При добавлении новой папки в Gallery/ — она появится
# в sitemap без ручного обновления.
# ============================================================
@app.get("/sitemap.xml", response_class=Response)
def sitemap():
    data = portfolio_service.build()
    sessions = data["sessions"]
    today = date.today().isoformat()

    # lastmod для каждой съёмки = mtime самого свежего фото в папке.
    # Если не удалось определить — fallback на today.
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
            from datetime import datetime
            return datetime.fromtimestamp(max_mtime).date().isoformat()
        return today

    # lastmod для главной = самый свежий mtime среди Favourites
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
            from datetime import datetime
            return datetime.fromtimestamp(max_mtime).date().isoformat()
        return today

    # lastmod для отзывов = mtime reviews.json
    def _reviews_lastmod() -> str:
        try:
            mtime = REVIEWS_FILE.stat().st_mtime if REVIEWS_FILE.exists() else 0.0
            if mtime > 0:
                from datetime import datetime
                return datetime.fromtimestamp(mtime).date().isoformat()
        except OSError:
            pass
        return today

    urls = [
        {"loc": "https://ekb.photographs.gs/", "lastmod": _featured_lastmod(), "changefreq": "weekly", "priority": "1.0"},
        {"loc": "https://ekb.photographs.gs/portfolio/", "lastmod": today, "changefreq": "weekly", "priority": "0.8"},
    ]

    # Каждая съёмка = отдельный URL в sitemap
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
        xml_parts.append("  <url>")
        xml_parts.append(f"    <loc>{u['loc']}</loc>")
        xml_parts.append(f"    <lastmod>{u['lastmod']}</lastmod>")
        xml_parts.append(f"    <changefreq>{u['changefreq']}</changefreq>")
        xml_parts.append(f"    <priority>{u['priority']}</priority>")
        xml_parts.append("  </url>")
    xml_parts.append("</urlset>")

    return Response(content="\n".join(xml_parts), media_type="application/xml")


# ============================================================
# 9. API-МАРШРУТЫ — JSON-эндпоинты
#
# Отдают те же данные что и страницы, но в JSON-формате.
# Использовались в SPA-версии, сейчас — для возможных
# внешних интеграций. Защищены от индексации:
# X-Robots-Tag: noindex, noarchive — поисковики игнорируют.
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
    resp.headers["X-Robots-Tag"] = "noindex, noarchive"  # Не индексировать JSON
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
# 10. СТАТИЧЕСКИЕ ФАЙЛЫ — обслуживание фото, миниатюр, CSS/JS
#
# Каждый маршрут проверяет:
# 1. Безопасность пути (не выходит за базовую директорию)
# 2. Существование файла
# 3. Отдаёт с правильным MIME-типом и Cache-Control: 1 день
#
# Если файл не найден — HTTPException(404) → кастомная 404-страница.
# ============================================================

# /favicon.ico — браузер автоматически запрашивает favicon.ico,
# хотя в HTML указан favicon.svg. Отдаём SVG с правильным MIME.
@app.get("/favicon.ico")
def favicon_ico():
    svg = DIST_DIR / "favicon.svg"
    if not svg.exists():
        svg = BASE_DIR / "public" / "favicon.svg"
    if svg.exists():
        return FileResponse(str(svg), media_type="image/svg+xml", headers={"Cache-Control": "public, max-age=86400"})
    raise HTTPException(status_code=404)


# /photos/* — оригинальные полноразмерные фото.
# Используются в лайтбоксе (полный размер при клике).
@app.get("/photos/{file_path:path}")
def serve_photo(file_path: str):
    full_path = _safe_file(PHOTOS_DIR, file_path)
    if full_path:
        return _file_response(full_path)
    raise HTTPException(status_code=404)


# /thumbs/* — JPEG-миниатюры (до 1200px, quality 80).
# Используются в галерее, featured, «Обо мне».
@app.get("/thumbs/{file_path:path}")
def serve_thumb(file_path: str):
    full_path = _safe_file(THUMBS_DIR, file_path)
    if full_path:
        return _file_response(full_path)
    raise HTTPException(status_code=404)


# /modern/* — WebP и AVIF миниатюры.
# Имена совпадают с JPEG-миниатюрами, но с расширением .webp/.avif.
@app.get("/modern/{file_path:path}")
def serve_modern(file_path: str):
    full_path = _safe_file(MODERN_DIR, file_path)
    if full_path:
        return _file_response(full_path)
    raise HTTPException(status_code=404)


# /assets/* — собранные CSS/JS файлы (с хешами в именах).
# Пример: /assets/index-C1Dxni3t.css
@app.get("/assets/{file_path:path}")
def serve_asset(file_path: str):
    full_path = _safe_file(DIST_DIR / "assets", file_path)
    if full_path:
        return _file_response(full_path)
    raise HTTPException(status_code=404)


# /* — всё остальное (favicon.svg, robots.txt, и т.д.).
# Ищет в dist/ (Vite-сборка). Это catch-all маршрут —
# стоит ПОСЛЕДНИМ, чтобы не перехватывать конкретные маршруты.
@app.get("/{full_path:path}")
def serve_static(full_path: str):
    full_path = _safe_file(DIST_DIR, full_path)
    if full_path:
        return _file_response(full_path)
    raise HTTPException(status_code=404)