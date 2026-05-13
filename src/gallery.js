/* ============================================================
   GALLERY.JS — Justified-сетка портфолио + фильтры по съёмкам
   
   Justified-раскладка: фото разной пропорции выстраиваются в ряды
   фиксированной высоты. Ширина каждого фото подбирается так,
   чтобы ряд ровно заполнил контейнер (как в Google Photos/Flickr).
   
   Фильтры: кнопка-тогл с выпадающим списком съёмок.
   «Все съёмки» — фото в случайном порядке (shuffle).
   Конкретная съёмка — фото в оригинальном порядке.
   
   При смене фильтра — URL обновляется через history.replaceState
   (без перезагрузки, но с правильным URL для шаринга).
   ============================================================ */
import { $, $$ } from './dom.js'
import { setLightboxList } from './state.js'
import { openLightbox } from './lightbox.js'
import { initScrollAnimations } from './scroll.js'

/* Целевая высота ряда фото */
const ROW_HEIGHT = 350                       /* Десктоп: 350px — крупные, детальные фото */
const ROW_HEIGHT_MOBILE = 180                /* Мобайл: 180px — компактнее, больше фото на экране */

/* Seeded PRNG (Mulberry32) — детерминированный рандом.
   Одинаковый seed = одинаковый порядок фото.
   Seed = день года (как на главной) — каждый день новый порядок,
   но в течение дня одинаковый для всех пользователей.
   Устраняет CLS: при навигации назад раскладка не прыгает. */
function _seededRandom(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

/* Fisher-Yates shuffle с опциональным PRNG.
   Без rng — Math.random() (недетерминированный).
   С rng — seeded (детерминированный, стабильный порядок). */
function shuffle(arr, rng) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor((rng || Math.random)() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/* День года для seed — совпадает с бэкендом (date.toordinal()). */
function _dayOfYear() {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 0)
  return Math.floor((now - start) / 86400000)
}

/* buildJustifiedRows — ядро justified-алгоритма.
   Раскладывает фото в ряды фиксированной высоты.
   Каждый ряд заполняет контейнер по ширине точно.
   Последний ряд — не растягивается (может быть короче). */
function buildJustifiedRows(photos, containerWidth, targetRowHeight, gap = 5) {
  if (!photos.length || containerWidth <= 0) return []

  const rows = []
  let currentRow = []
  let currentRowWidth = 0

  for (const photo of photos) {
    const w = photo.width || targetRowHeight * 0.75  /* Дефолт 3:4 — вертикальный портрет */
    const h = photo.height || targetRowHeight
    const aspectRatio = w / h
    const displayWidth = aspectRatio * targetRowHeight  /* Ширина фото при целевой высоте */

    currentRow.push({ ...photo, aspectRatio, displayWidth })
    currentRowWidth += displayWidth + gap

    /* Ряд заполнен когда суммарная ширина ≥ контейнер */
    if (currentRowWidth - gap >= containerWidth) {
      const totalGap = (currentRow.length - 1) * gap
      /* Пересчёт высоты ряда: containerWidth / sum(aspectRatio) — ряд точно заполняет ширину */
      const adjustedRowHeight = (containerWidth - totalGap) / currentRow.reduce((s, i) => s + i.aspectRatio, 0)

      currentRow.forEach(item => {
        item.displayWidth = item.aspectRatio * adjustedRowHeight /* Ширина при новой высоте */
      })
      rows.push({ items: currentRow, rowHeight: adjustedRowHeight })
      currentRow = []
      currentRowWidth = 0
    }
  }

  /* Последний ряд: может быть не заполнен.
     Ограничиваем высоту до 1.2× target — чтобы не растянулся
     одинокий портрет на всю ширину. */
  if (currentRow.length > 0) {
    const totalGap = (currentRow.length - 1) * gap
    const totalAspect = currentRow.reduce((s, i) => s + i.aspectRatio, 0)
    const lastRowHeight = Math.min((containerWidth - totalGap) / totalAspect, targetRowHeight * 1.2)

    currentRow.forEach(item => {
      item.displayWidth = item.aspectRatio * lastRowHeight
    })
    rows.push({ items: currentRow, rowHeight: lastRowHeight })
  }

  return rows
}

/* renderGrid — создаёт DOM-элементы для justified-сетки.
   Каждый ряд — div.gallery__row, фото внутри — div.gallery__item. */
function renderGrid(photos) {
  const grid = $('#galleryGrid')
  if (!grid || !photos?.length) return
  grid.innerHTML = ''                         /* Очищаем перед перерисовкой */

  /* Вычисляем ширину контейнера за вычетом padding */
  const style = getComputedStyle(grid)
  const containerWidth = grid.clientWidth
    - parseFloat(style.paddingLeft)
    - parseFloat(style.paddingRight)

  const gap = 5                              /* 5px зазор между фото — должен совпадать с CSS margin-right/margin-bottom */
  const targetRowHeight = window.innerWidth <= 768 ? ROW_HEIGHT_MOBILE : ROW_HEIGHT

  const rows = buildJustifiedRows(photos, containerWidth, targetRowHeight, gap)

  let globalIdx = 0                          /* Глобальный индекс для лайтбокса (0, 1, 2, ...) */

  rows.forEach((row) => {
    const rowEl = document.createElement('div')
    rowEl.className = 'gallery__row'
    rowEl.style.height = `${Math.round(row.rowHeight)}px` /* Фиксированная высота ряда */

    row.items.forEach((item) => {
      const itemIndex = globalIdx++

      const itemEl = document.createElement('div')
      itemEl.className = 'gallery__item anim-fade-up'
      itemEl.style.width = `${Math.round(item.displayWidth)}px`  /* Точная ширина фото */
      itemEl.style.height = `${Math.round(row.rowHeight)}px`     /* Высота = высота ряда */

      /* <picture> с AVIF → WebP → JPEG fallback */
      const picture = document.createElement('picture')
      if (item.thumb_avif) {
        const avifSrc = document.createElement('source')
        avifSrc.srcset = item.thumb_avif
        avifSrc.type = 'image/avif'
        picture.appendChild(avifSrc)
      }
      if (item.thumb_webp) {
        const webpSrc = document.createElement('source')
        webpSrc.srcset = item.thumb_webp
        webpSrc.type = 'image/webp'
        picture.appendChild(webpSrc)
      }
      const img = document.createElement('img')
      img.src = item.thumb                    /* JPEG fallback */
      img.alt = item.title
      img.loading = 'lazy'                   /* Ленивая загрузка — фото за экраном не грузятся */
      picture.appendChild(img)

      /* Оверлей с названием + описанием при hover */
      const overlay = document.createElement('div')
      overlay.className = 'gallery__item-overlay'

      const title = document.createElement('h3')
      title.className = 'gallery__item-title'
      title.textContent = item.title

      overlay.appendChild(title)
      if (item.description) {
        const desc = document.createElement('p')
        desc.className = 'gallery__item-desc'
        desc.textContent = item.description
        overlay.appendChild(desc)
      }
      itemEl.appendChild(picture)
      itemEl.appendChild(overlay)

      /* Клик → открываем лайтбокс на этом фото */
      itemEl.addEventListener('click', () => {
        setLightboxList(photos)
        openLightbox(itemIndex)
      })
      rowEl.appendChild(itemEl)
    })

    grid.appendChild(rowEl)
  })
}

let _currentPhotos = []                      /* Текущий отображаемый список фото */

/* initGallery — точка входа для страницы портфолио.
   Определяет активную съёмку, рисует сетку, вешает фильтры. */
export function initGallery() {
  const galleryData = window.__GALLERY_DATA__  /* Массив съёмок из бэкенда: [{id, title, photos}] */
  if (!galleryData?.length) return

  const allPhotos = galleryData.flatMap(s => s.photos) /* Все фото всех съёмок */
  const activeSession = window.__ACTIVE_SESSION__      /* ID выбранной съёмки или null */

  /* --- Кнопка «Наверх» --- */
  const scrollTopBtn = $('#scrollTop')
  if (scrollTopBtn) {
    const checkScroll = () => {
      const show = window.scrollY > window.innerHeight * 2
      scrollTopBtn.classList.toggle('visible', show)
    }
    window.addEventListener('scroll', checkScroll, { passive: true })
    checkScroll()
    scrollTopBtn.addEventListener('click', () => {
      const filterWrap = $('.gallery__filter-wrap')
      if (filterWrap) {
        filterWrap.scrollIntoView({ behavior: 'smooth', block: 'start' })
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    })
  }

  if (activeSession) {
    /* Конкретная съёмка — фото в оригинальном порядке */
    const session = galleryData.find(s => s.id === activeSession)
    if (session) {
      _currentPhotos = session.photos
    }
  } else {
    /* «Все съёмки» — детерминированный shuffle (seed = день года) */
    _currentPhotos = shuffle(allPhotos, _seededRandom(_dayOfYear()))
  }

  renderGrid(_currentPhotos)
  setLightboxList(_currentPhotos)

  /* --- Обработка popstate (кнопки Назад/Вперёд в браузере) ---
     Когда URL меняется через history.back()/forward(), перечитываем
     параметр session и переключаем фильтр без перезагрузки. */
  window.addEventListener('popstate', () => {
    const params = new URLSearchParams(window.location.search)
    const sessionId = params.get('session') || ''

    if (sessionId) {
      const session = galleryData.find(s => s.id === sessionId)
      if (session) {
        _currentPhotos = session.photos
        if (toggle) toggle.innerHTML = `${session.title}<span class="gallery__filter-arrow">&#9662;</span>`
      }
    } else {
      _currentPhotos = shuffle(allPhotos, _seededRandom(_dayOfYear()))
      if (toggle) toggle.innerHTML = `Все съёмки<span class="gallery__filter-arrow">&#9662;</span>`
    }

    $$('.gallery__filter-option').forEach(b => b.classList.remove('gallery__filter-option--active'))
    const activeBtn = document.querySelector(`.gallery__filter-option[data-session="${sessionId}"]`)
    if (activeBtn) activeBtn.classList.add('gallery__filter-option--active')

    renderGrid(_currentPhotos)
    setLightboxList(_currentPhotos)
  })

  /* --- Фильтры по съёмкам --- */
  const wrap = $('.gallery__filter-wrap')
  const inner = $('.gallery__filter-inner')
  const toggle = $('#filterToggle')
  const dropdown = $('#filterDropdown')

  if (toggle && dropdown && inner) {
    /* Клик по тоглу — открыть/закрыть выпадающий список */
    toggle.addEventListener('click', () => {
      const open = inner.classList.toggle('gallery__filter-inner--open')
      toggle.setAttribute('aria-expanded', String(open)) /* Для доступности */
    })

    /* Клик вне выпадающего списка — закрыть его */
    document.addEventListener('click', (e) => {
      if (!inner.contains(e.target)) {
        inner.classList.remove('gallery__filter-inner--open')
        toggle.setAttribute('aria-expanded', 'false')
      }
    })

    /* Клик по опции фильтра — сменить съёмку */
    $$('.gallery__filter-option').forEach(btn => {
      btn.addEventListener('click', () => {
        const sessionId = btn.dataset.session  /* "" = все съёмки, "2-05-26 Maxim" = конкретная */

        /* Обновляем визуал: подсвечиваем активную опцию */
        $$('.gallery__filter-option').forEach(b => b.classList.remove('gallery__filter-option--active'))
        btn.classList.add('gallery__filter-option--active')

        if (sessionId) {
          /* Конкретная съёмка */
          const session = galleryData.find(s => s.id === sessionId)
          if (session) {
            _currentPhotos = session.photos
            toggle.innerHTML = `${session.title}<span class="gallery__filter-arrow">&#9662;</span>`
          }
        } else {
          /* Все съёмки — детерминированный shuffle */
          _currentPhotos = shuffle(allPhotos, _seededRandom(_dayOfYear()))
          toggle.innerHTML = `Все съёмки<span class="gallery__filter-arrow">&#9662;</span>`
        }

        inner.classList.remove('gallery__filter-inner--open') /* Закрываем dropdown */
    toggle.setAttribute('aria-expanded', 'false')

        renderGrid(_currentPhotos)            /* Перерисовываем сетку */
        setLightboxList(_currentPhotos)        /* Обновляем список для лайтбокса */

        /* Обновляем URL без перезагрузки — для шаринга и аналитики */
        const url = sessionId ? `/portfolio/?session=${sessionId}` : '/portfolio/'
        history.replaceState(null, '', url)

        /* Регистрируем новые .anim-fade-up элементы в Observer */
        initScrollAnimations()
      })
    })
  }
}

/* renderCurrentGallery — перерисовка текущей сетки.
   Вызывается при resize — ширина контейнера изменилась. */
export function renderCurrentGallery() {
  if (_currentPhotos.length) {
    renderGrid(_currentPhotos)
  }
}
