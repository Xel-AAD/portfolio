#!/usr/bin/env bash
set -uo pipefail

PHOTOS_DIR="$(cd "$(dirname "$0")" && pwd)/public/photos"
INCOMING_DIR="$PHOTOS_DIR/incoming"

SIZES=(
  "800:thumbs"
  "300:mobile"
  "3000:lightbox"
)

log() { printf "\033[1m[%s]\033[0m %s\n" "$(date +%H:%M:%S)" "$*"; }

resize_one() {
  local src="$1" out_dir="$2" max_side="$3"
  local rel="${src#$INCOMING_DIR/}"
  local out_path="$out_dir/${rel%.*}.webp"
  mkdir -p "$(dirname "$out_path")"
  magick "$src" -resize "${max_side}x${max_side}>" -quality 82 -define webp:effort=4 "$out_path" 2>/dev/null
}
export -f resize_one
export INCOMING_DIR

if [[ ! -d "$INCOMING_DIR" ]]; then
  log "Создаю incoming/ — сюда кладите оригиналы фото"
  mkdir -p "$INCOMING_DIR"
  echo
  log "Структура:"
  log "  incoming/Favourites/фото.webp"
  log "  incoming/Gallery/Новая-съёмка/фото.webp"
  log "  incoming/About-me/фото.webp"
  log ""
  log "Имена подпапок должны совпадать с папками сайта (Favourites, Gallery, About-me)."
  log "Положите фото и запустите скрипт снова."
  exit 0
fi

src_count=$(find "$INCOMING_DIR" -type f \( -iname "*.webp" -o -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" -o -iname "*.tiff" -o -iname "*.bmp" -o -iname "*.heic" -o -iname "*.avif" \) -not -name ".*" | wc -l | tr -d ' ')

if [[ "$src_count" -eq 0 ]]; then
  log "В incoming/ нет фото. Положите оригиналы и запустите скрипт снова."
  exit 0
fi

log "Фото-ресайзер"
log "Источник: $INCOMING_DIR"
log "Исходных фото: $src_count"

for entry in "${SIZES[@]}"; do
  IFS=':' read -r size name <<< "$entry"
  target_dir="$PHOTOS_DIR/$name"
  log "=== ${name} (${size}px) ==="
  rm -rf "$target_dir"
  mkdir -p "$target_dir"

  find "$INCOMING_DIR" -type f \( -iname "*.webp" -o -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" -o -iname "*.tiff" -o -iname "*.bmp" -o -iname "*.heic" -o -iname "*.avif" \) -not -name ".*" -print0 \
    | xargs -0 -P4 -I{} bash -c 'resize_one "$1" "$2" "$3"' _ {} "$target_dir" "$size"

  count=$(find "$target_dir" -type f | wc -l | tr -d ' ')
  du_out=$(du -sh "$target_dir" 2>/dev/null | cut -f1)
  log "  ${name}: $count фото, $du_out"
done

log "Удаляю оригиналы из incoming/..."
rm -rf "$INCOMING_DIR"/*

echo
log "Готово! Ресайзнутые фото лежат в:"
log "  thumbs/    — 800px (десктоп, превью)"
log "  mobile/    — 300px (телефон)"
log " lightbox/ — 3000px (лайтбокс)"
