#!/usr/bin/env bash
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PHOTOS_DIR="$SCRIPT_DIR/public/photos"

BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[32m'
YELLOW='\033[33m'
CYAN='\033[36m'
RESET='\033[0m'

prompt() { printf "${BOLD}%s${RESET}" "$*"; }

log()   { printf "${BOLD}[%s]${RESET} %s\n" "$(date +%H:%M:%S)" "$*"; }
ok()    { printf "${GREEN}${BOLD}[%s]${RESET} ${GREEN}%s${RESET}\n" "$(date +%H:%M:%S)" "$*"; }
warn()  { printf "${YELLOW}${BOLD}[%s]${RESET} ${YELLOW}%s${RESET}\n" "$(date +%H:%M:%S)" "$*"; }

resize_one() {
  local src="$1" out_dir="$2" max_side="$3" src_root="$4"
  local rel="${src#$src_root/}"
  local out_path="$out_dir/${rel%.*}.webp"
  mkdir -p "$(dirname "$out_path")"
  magick "$src" -resize "${max_side}x${max_side}>" -quality 82 -define webp:effort=4 "$out_path" 2>/dev/null
}
export -f resize_one

EXTS=\( -iname "*.webp" -o -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" -o -iname "*.tiff" -o -iname "*.bmp" -o -iname "*.heic" -o -iname "*.avif" \)

echo
printf "${CYAN}${BOLD}  Фото-ресайзер (интерактивный)${RESET}"
echo
echo

printf "  ${DIM}Доступные папки в public/photos/:${RESET}\n"
if [[ -d "$PHOTOS_DIR" ]]; then
  ls -1 "$PHOTOS_DIR" 2>/dev/null | sed 's/^/    /'
else
  echo "    (папка не найдена)"
fi
echo

prompt "  Папка-источник (относительно public/photos/ или абсолютный путь): "
read -r SRC_INPUT

if [[ -z "$SRC_INPUT" ]]; then
  warn "Пустой ввод, выхожу."; exit 1
fi

if [[ "$SRC_INPUT" = /* ]]; then
  SRC_DIR="$SRC_INPUT"
else
  SRC_DIR="$PHOTOS_DIR/$SRC_INPUT"
fi

if [[ ! -d "$SRC_DIR" ]]; then
  warn "Папка не найдена: $SRC_DIR"; exit 1
fi

src_count=$(find "$SRC_DIR" -type f $EXTS -not -name ".*" | wc -l | tr -d ' ')
if [[ "$src_count" -eq 0 ]]; then
  warn "В папке нет фото: $SRC_DIR"; exit 1
fi

ok "Найдено фото: $src_count"
echo

printf "  ${DIM}Размеры по умолчанию:${RESET}\n"
printf "    ${BOLD}1)${RESET} 800px   — thumbs (превью десктоп)\n"
printf "    ${BOLD}2)${RESET} 300px   — mobile (телефон)\n"
printf "    ${BOLD}3)${RESET} 3000px  — lightbox (лайтбокс)\n"
printf "    ${BOLD}4)${RESET} Свой размер\n"
echo
prompt "  Выберите размер [1-4] (по умолчанию 1): "
read -r SIZE_CHOICE
SIZE_CHOICE="${SIZE_CHOICE:-1}"

case "$SIZE_CHOICE" in
  1) MAX_SIDE=800; SIZE_NAME="thumbs" ;;
  2) MAX_SIDE=300; SIZE_NAME="mobile" ;;
  3) MAX_SIDE=3000; SIZE_NAME="lightbox" ;;
  4)
    prompt "  Введите максимальную сторону в px: "
    read -r CUSTOM_SIZE
    if [[ ! "$CUSTOM_SIZE" =~ ^[0-9]+$ ]] || [[ "$CUSTOM_SIZE" -lt 1 ]]; then
      warn "Некорректный размер: $CUSTOM_SIZE"; exit 1
    fi
    MAX_SIDE="$CUSTOM_SIZE"
    SIZE_NAME="custom-${MAX_SIDE}"
    ;;
  *)
    warn "Неизвестный выбор: $SIZE_CHOICE"; exit 1
    ;;
esac

echo
printf "  ${DIM}Папка назначения (относительно public/photos/ или абсолютный путь):${RESET}\n"
prompt "  [по умолчанию: $SIZE_NAME]: "
read -r DST_INPUT
DST_INPUT="${DST_INPUT:-$SIZE_NAME}"

if [[ "$DST_INPUT" = /* ]]; then
  DST_DIR="$DST_INPUT"
else
  DST_DIR="$PHOTOS_DIR/$DST_INPUT"
fi

echo
log "Источник:   $SRC_DIR ($src_count фото)"
log "Назначение: $DST_DIR"
log "Размер:     ${MAX_SIDE}px"
echo

if [[ "$DST_DIR" = "$SRC_DIR" ]]; then
  warn "Папка назначения совпадает с источником! Это перезапишет оригиналы."
  prompt "  Продолжить? [y/N]: "
  read -r CONFIRM
  [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]] && { warn "Отменено."; exit 0; }
fi

if [[ -d "$DST_DIR" ]] && [[ "$(find "$DST_DIR" -type f | wc -l | tr -d '')" -gt 0 ]]; then
  warn "Папка назначения уже содержит файлы: $DST_DIR"
  prompt "  Очистить перед ресайзом? [Y/n]: "
  read -r CLEAN
  if [[ "$CLEAN" != "n" && "$CLEAN" != "N" ]]; then
    rm -rf "$DST_DIR"/*
    ok "Папка очищена"
  fi
fi

mkdir -p "$DST_DIR"

log "Ресайз ${MAX_SIDE}px..."
find "$SRC_DIR" -type f $EXTS -not -name ".*" -print0 \
  | xargs -0 -P4 -I{} bash -c 'resize_one "$1" "$2" "$3" "$4"' _ {} "$DST_DIR" "$MAX_SIDE" "$SRC_DIR"

count=$(find "$DST_DIR" -type f | wc -l | tr -d ' ')
du_out=$(du -sh "$DST_DIR" 2>/dev/null | cut -f1)

echo
ok "Готово! $count фото → $DST_DIR ($du_out)"
