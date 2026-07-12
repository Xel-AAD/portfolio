#!/usr/bin/env bash
set -uo pipefail

SCRIPT_VERSION="v3 (совместим с bash 3.2 из macOS)"

BOLD='\033[1m'
GREEN='\033[32m'
YELLOW='\033[33m'
CYAN='\033[36m'
RED='\033[31m'
RESET='\033[0m'

log()  { printf "${BOLD}[%s]${RESET} %s\n" "$(date +%H:%M:%S)" "$*"; }
ok()   { printf "${GREEN}${BOLD}[%s]${RESET} ${GREEN}%s${RESET}\n" "$(date +%H:%M:%S)" "$*"; }
warn() { printf "${YELLOW}${BOLD}[%s]${RESET} ${YELLOW}%s${RESET}\n" "$(date +%H:%M:%S)" "$*"; }
err()  { printf "${RED}${BOLD}[%s]${RESET} ${RED}%s${RESET}\n" "$(date +%H:%M:%S)" "$*"; }

echo
printf "${CYAN}${BOLD}=== Безопасный переименовыватель — %s ===${RESET}\n\n" "$SCRIPT_VERSION"

prompt() { printf "${BOLD}%s${RESET}" "$*"; }

prompt "Полный путь до папки: "
read -r dir_path
dir_path="${dir_path%/}"

[[ ! -d "$dir_path" ]] && { warn "Папка не найдена"; exit 1; }

prompt "Шаблон (например 5-07-2026): "
read -r prefix

prompt "Начинать нумерацию с номера (по умолчанию 1): "
read -r start_num
start_num=${start_num:-1}

if ! [[ "$start_num" =~ ^[0-9]+$ ]]; then
  warn "Некорректное число, буду нумеровать с 1"
  start_num=1
else
  start_num=$((10#$start_num))
fi

# ===== Собираем файлы (без mapfile — его нет в bash 3.2) =====
files=()
while IFS= read -r line; do
  files+=("$line")
done < <(find "$dir_path" -maxdepth 1 -type f \( -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" -o -iname "*.webp" \) -print)

[[ ${#files[@]} -eq 0 ]] && { warn "Файлы не найдены"; exit 1; }

log "Найдено ${#files[@]} файлов"

# ===== Сортировка =====
# Если файл уже назван по текущему шаблону "prefix-N.ext" (типичный
# случай при повторном прогоне на уже пронумерованных фото) — сортируем
# по числу N из имени, это самый надёжный источник порядка.
# Если нет (свежие фото с камеры/телефона, ещё не нумеровались) —
# сортируем по дате изменения файла.
# Просто "по имени" не подходит: алфавитно "10" встаёт раньше "9".
# Просто "по дате" тоже не всегда подходит: если все файлы скопированы
# одним пакетом, у них может быть одна и та же mtime — тогда сортировка
# незаметно съезжает на сравнение по имени как строке, и получается
# путаный алфавитный порядок вместо числового.
get_mtime() {
  stat -f '%m' "$1" 2>/dev/null || stat -c '%Y' "$1" 2>/dev/null
}

get_sort_key() {
  local f="$1"
  local base rest num
  base="$(basename "$f")"
  if [[ "$base" == "${prefix}-"[0-9]*"."* ]]; then
    rest="${base#${prefix}-}"
    num="${rest%%.*}"
    if [[ "$num" =~ ^[0-9]+$ ]]; then
      printf '0:%010d' "$num"
      return
    fi
  fi
  printf '1:%020d' "$(get_mtime "$f")"
}

sorted_files=()
while IFS=$'\t' read -r _ path; do
  sorted_files+=("$path")
done < <(
  for f in "${files[@]}"; do
    printf '%s\t%s\n' "$(get_sort_key "$f")" "$f"
  done | sort -t $'\t' -k1,1
)
files=("${sorted_files[@]}")

# ===== Считаем финальные имена (без declare -A — её тоже нет в bash 3.2) =====
new_names=()
for i in "${!files[@]}"; do
  ext="${files[i]##*.}"
  new_names[i]="${prefix}-$((start_num + i)).${ext}"
done

dup=$(printf '%s\n' "${new_names[@]}" | sort | uniq -d)
if [[ -n "$dup" ]]; then
  err "Обнаружены дублирующиеся итоговые имена, ничего не тронуто:"
  echo "$dup"
  exit 1
fi

echo
log "План переименования (по дате изменения файла):"
for i in "${!files[@]}"; do
  old=$(basename "${files[i]}")
  echo "  $old → ${new_names[i]}"
done

echo
prompt "Подтвердить? (y/n): "
read -r confirm
[[ "$confirm" != "y" ]] && { log "Отменено"; exit 0; }

# ===== Бэкап — ВНЕ переименовываемой папки =====
backup_dir="$(dirname "$dir_path")/$(basename "$dir_path")_backup_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$backup_dir"
copy_ok=1
for f in "${files[@]}"; do
  cp -a "$f" "$backup_dir/" 2>/dev/null || copy_ok=0
done
if [[ $copy_ok -eq 1 ]]; then
  ok "Бэкап создан: $backup_dir"
else
  err "Бэкап создан не полностью! Проверьте: $backup_dir"
  prompt "Продолжить без гарантированного бэкапа? (y/n): "
  read -r cont
  [[ "$cont" != "y" ]] && { log "Отменено"; exit 1; }
fi

# ===== Переименование в 2 прохода =====
# Временное имя — заведомо не встречающееся среди реальных файлов:
# большое случайное число (метка времени + $RANDOM), а не короткий
# суффикс, который в теории мог бы с чем-то совпасть.
run_id="9$(date +%s)${RANDOM}${RANDOM}"
tmp_files=()

log "Шаг 1/2: временные имена (например tmp_${run_id}_0.ext)..."
step1_fail=0
for i in "${!files[@]}"; do
  old="${files[i]}"
  ext="${old##*.}"
  tmp_name="$dir_path/tmp_${run_id}_${i}.${ext}"
  if mv -n -- "$old" "$tmp_name" 2>/dev/null; then
    tmp_files[i]="$tmp_name"
  else
    err "Не удалось создать временное имя для: $(basename "$old")"
    tmp_files[i]=""
    step1_fail=1
  fi
done

if [[ $step1_fail -eq 1 ]]; then
  err "Ошибка на шаге 1. Откатываю уже переименованные файлы обратно..."
  for i in "${!tmp_files[@]}"; do
    [[ -n "${tmp_files[i]:-}" ]] && mv -n -- "${tmp_files[i]}" "${files[i]}" 2>/dev/null
  done
  err "Переименование прервано. Файлы возвращены. Бэкап на всякий случай тут: $backup_dir"
  exit 1
fi

log "Шаг 2/2: финальные имена..."
fail_count=0
for i in "${!files[@]}"; do
  new_file="$dir_path/${new_names[i]}"
  if mv -n -- "${tmp_files[i]}" "$new_file" 2>/dev/null; then
    echo "  [ok] ${new_names[i]}"
  else
    err "Не удалось переименовать во: ${new_names[i]} (файл остался как $(basename "${tmp_files[i]}"))"
    fail_count=$((fail_count + 1))
  fi
done

# ===== Проверка результата =====
final_count=$(find "$dir_path" -maxdepth 1 -type f -name "${prefix}-*" | wc -l)
echo
if [[ $fail_count -gt 0 ]]; then
  err "Готово с ошибками: $fail_count файл(ов) не переименованы. Было: ${#files[@]}, стало: $final_count."
  err "Бэкап цел: $backup_dir"
elif [[ $final_count -ne ${#files[@]} ]]; then
  err "Внимание: количество файлов не совпадает (было ${#files[@]}, стало $final_count)."
  err "Проверьте папку и бэкап: $backup_dir"
else
  ok "Переименование завершено! Файлов: $final_count"
fi