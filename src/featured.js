/* ============================================================
   FEATURED.JS — Masonry-сетка избранных фото на главной
   
   Алгоритм: фото распределяются по колонкам (4 десктоп / 2 мобайл).
   Каждое следующее фото идёт в самую короткую колонку —
   поэтому колонки примерно одинаковой высоты (masonry).
   
   После заполнения — выравнивание: у последнего фото в короткой
   колонке растягивается высота, чтобы все колонки были равны.
   
   Фото обёрнуты в <picture> с AVIF → WebP → JPEG fallback.
   Клик по фото открывает лайтбокс.
   ============================================================ */
import { $ } from './dom.js'
import { setLightboxList } from './state.js'
import { openLightbox } from './lightbox.js'

export function renderFeatured() {
  const photos = window.__LIGHTBOX_DATA__    /* Массив фото из бэкенда */
  if (!photos?.length) return

  const grid = $('#featuredGrid')
  if (!grid) return
  grid.innerHTML = ''                         /* Очищаем перед перерисовкой */

  /* Вычисляем ширину контейнера за вычетом padding */
  const style = getComputedStyle(grid)
  const containerWidth = grid.clientWidth
    - parseFloat(style.paddingLeft)
    - parseFloat(style.paddingRight)

  const gap = 10                              /* 10px между фото по вертикали */
  const isMobile = window.innerWidth <= 768
  const colCount = isMobile ? 2 : 4          /* 2 колонки на мобайл, 4 на десктопе */
  const colWidth = (containerWidth - (colCount - 1) * gap) / colCount

  /* Создаём массив колонок: каждая хранит DOM-элемент, высоту, элементы, высоты фото */
  const columns = Array.from({ length: colCount }, () => ({
    el: null,
    height: 0,
    items: [],
    imgHeights: []
  }))

  /* Создаём DOM-колонки */
  for (let i = 0; i < colCount; i++) {
    const colEl = document.createElement('div')
    colEl.className = 'featured__col'
    colEl.style.width = `${colWidth}px`
    columns[i].el = colEl
    grid.appendChild(colEl)
  }

  /* Заполняем колонки фото */
  photos.forEach((photo, idx) => {
    const w = photo.width || 3                /* Дефолт 3:4 — вертикальное портретное фото */
    const h = photo.height || 4
    const imgHeight = colWidth * (h / w)      /* Пропорциональная высота = ширина × соотношение */

    /* Ищем самую короткую колонку — туда идёт фото */
    const shortest = columns.reduce((min, col, i) => col.height < columns[min].height ? i : min, 0)

    /* DOM-элемент фото */
    const itemEl = document.createElement('div')
    itemEl.className = 'featured__item anim-fade-up'
    itemEl.style.marginBottom = `${gap}px`    /* 10px отступ до следующего фото в колонке */

    /* <picture> с AVIF → WebP → JPEG fallback (современные форматы приоритетнее) */
    const picture = document.createElement('picture')
    if (photo.thumb_avif) {
      const avifSrc = document.createElement('source')
      avifSrc.srcset = photo.thumb_avif       /* AVIF — самый лёгкий формат (40-75% меньше JPEG) */
      avifSrc.type = 'image/avif'
      picture.appendChild(avifSrc)
    }
    if (photo.thumb_webp) {
      const webpSrc = document.createElement('source')
      webpSrc.srcset = photo.thumb_webp       /* WebP — средний (47-63% меньше JPEG) */
      webpSrc.type = 'image/webp'
      picture.appendChild(webpSrc)
    }
    const img = document.createElement('img')
    img.src = photo.thumb                     /* JPEG — fallback для старых браузеров */
    img.alt = photo.title
    img.loading = 'lazy'                      /* Ленивая загрузка — не грузим фото за пределами экрана */
    img.width = Math.round(colWidth)          /* width/height — предотвращают CLS (сдвиг контента) */
    img.height = Math.round(imgHeight)
    picture.appendChild(img)

    /* Оверлей с названием при hover */
    const overlay = document.createElement('div')
    overlay.className = 'featured__item-overlay'

    const title = document.createElement('h3')
    title.className = 'featured__item-title'
    title.textContent = photo.title

    overlay.appendChild(title)
    itemEl.appendChild(picture)
    itemEl.appendChild(overlay)

    /* Клик → открываем лайтбокс на этом фото */
    itemEl.addEventListener('click', () => {
      setLightboxList(photos)                 /* Передаём весь список — можно листать */
      openLightbox(idx)                       /* Открываем на текущем индексе */
    })

    /* Добавляем в самую короткую колонку */
    columns[shortest].el.appendChild(itemEl)
    columns[shortest].height += imgHeight + gap /* Увеличиваем высоту колонки */
    columns[shortest].items.push(itemEl)
    columns[shortest].imgHeights.push(imgHeight)
  })

  /* --- Выравнивание колонок ---
     Последнее фото в короткой колонке растягивается
     по высоте, чтобы колонки были одинаковой высоты.
     diff > 2px — чтобы не растягивать на микро-разницу. */
  const maxH = Math.max(...columns.map(c => c.height))

  columns.forEach(col => {
    const lastIdx = col.items.length - 1
    if (lastIdx < 0) return

    col.items[lastIdx].style.marginBottom = '0' /* У последнего — нет нижнего отступа */

    const diff = maxH - col.height            /* Насколько колонка короче самой высокой */
    if (diff > 2) {
      const img = col.items[lastIdx].querySelector('img')
      if (img) {
        const newH = col.imgHeights[lastIdx] + diff /* Новая высота = оригинальная + разница */
        img.style.height = `${Math.round(newH)}px`
        img.style.objectFit = 'cover'          /* Обрезаем, не искажаем */
      }
    }
  })
}
