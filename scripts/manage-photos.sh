#!/usr/bin/env bash
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PHOTOS_DIR="$PROJECT_ROOT/public/photos"
INCOMING_DIR="$PHOTOS_DIR/incoming"

BOLD='\033[1m'
GREEN='\033[32m'
YELLOW='\033[33m'
CYAN='\033[36m'
RESET='\033[0m'

log()  { printf "${BOLD}[%s]${RESET} %s\n" "$(date +%H:%M:%S)" "$*"; }
ok()   { printf "${GREEN}${BOLD}[%s]${RESET} ${GREEN}%s${RESET}\n" "$(date +%H:%M:%S)" "$*"; }
warn() { printf "${YELLOW}${BOLD}[%s]${RESET} ${YELLOW}%s${RESET}\n" "$(date +%H:%M:%S)" "$*"; }

# ====================== ПРОГРЕСС + ИСПРАВЛЕННЫЙ ПУТЬ ======================
resize_session() {
  local session_path="$1"
  local target_dir="$2"
  local size="$3"
  local files=()
  
  while IFS= read -r -d '' file; do
    files+=("$file")
  done < <(find "$session_path" -type f \( -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" -o -iname "*.webp" \) -print0)

  local total=${#files[@]}
  if [[ $total -eq 0 ]]; then return; fi

  local count=0
  for src in "${files[@]}"; do
    ((count++))
    local percent=$((count * 100 / total))
    printf "\r  [%3d%%] Обработка..." "$percent"

    # ИСПРАВЛЕННЫЙ путь — берём только имя файла + подпапку сессии
    local filename=$(basename "$src")
    local out_path="$target_dir/$filename"
    out_path="${out_path%.*}.webp"

    mkdir -p "$(dirname "$out_path")"

    if [[ ! -f "$out_path" ]]; then
      magick "$src" -resize "${size}x${size}>" -quality 82 -define webp:effort=4 "$out_path" 2>/dev/null
    fi
  done
  printf "\r  [100%%] Готово!%*s\n" 40 ""
}

show_menu() {
  echo
  printf "${CYAN}${BOLD}=== Управление фото портфолио ===${RESET}\n"
  echo "1) Добавить фотосессию в Gallery"
  echo "2) Удалить фото"
  echo "3) About-me / Favourites"
  echo "4) Справка"
  echo "0) Выход"
  echo
  prompt "Выберите действие: "
}

prompt() { printf "${BOLD}%s${RESET}" "$*"; }

while true; do
  show_menu
  read -r choice

  case $choice in
    1)
      log "Добавление фотосессии"
      if [[ ! -d "$INCOMING_DIR" ]] || [[ -z "$(find "$INCOMING_DIR" -type f -name "*.jpg" | head -n1)" ]]; then
        warn "incoming/ пуст"
        continue
      fi

      ls -1 "$INCOMING_DIR"
      prompt "Название сессии: "
      read -r session_name

      session_path="$INCOMING_DIR/$session_name"
      if [[ ! -d "$session_path" ]]; then
        warn "Папка не найдена"
        continue
      fi

      for size_dir in thumbs mobile lightbox; do
        case $size_dir in
          thumbs) size=800 ;;
          mobile) size=300 ;;
          lightbox) size=3000 ;;
        esac
        target_dir="$PHOTOS_DIR/$size_dir/Gallery/$session_name"
        log "Генерируем $size_dir (${size}px)..."
        resize_session "$session_path" "$target_dir" "$size"
      done

      ok "Сессия '$session_name' успешно добавлена!"
      ;;

    2)
      prompt "Имя файла (без расширения): "
      read -r filename
      find "$PHOTOS_DIR" \( -path "*/thumbs/*" -o -path "*/mobile/*" -o -path "*/lightbox/*" \) -name "${filename}.webp" -delete
      ok "Удалено"
      ;;

    0|q|exit)
      log "Выход"
      exit 0
      ;;

    *)
      warn "Неверный выбор"
      ;;
  esac
done