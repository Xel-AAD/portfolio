/* ============================================================
   LIGHTBOX.JS — Полноэкранный просмотр фото
   
   Двухслойная система:
   1. .lightbox__img--thumb — размытая миниатюра (blur-up).
      Появляется мгновенно (маленький файл) → плавный зум от 0.92→1.
   2. .lightbox__img--full — полноразмерное фото.
      Загружается в фоне, когда готово — плавно проявляется поверх.
   
   Навигация: ←/→ кнопки, свайп, клавиатура (Esc, ArrowLeft/Right).
   Циклическая: после последнего → первый.
   
   Zoom ( pinch-zoom / double-tap / wheel / dblclick ):
   • Pinch двумя пальцами — зум от 1x до 5x, точка зума = центр щипка
   • Pan одним пальцем — перетаскивание при zoom > 1x
   • Double-tap / dblclick — переключение 1x ↔ 2.5x (в точке тапа)
   • Scroll wheel — плавный зум от курсора (десктоп)
   • Drag мышью — перетаскивание при zoom > 1x (десктоп)
   • Автовозврат: при zoom < 1.1 → сброс на 1x
   
   Все zoom-трансформы применяются к .lightbox__zoom (wrapper),
   а не к самим изображениям — поэтому анимации открытия/
   закрытия/навигации не конфликтуют с zoom.
   
   Таймеры:
   • _lbTimer       — задержка навигации (250мс анимация → смена фото)
   • _lbCloseTimer  — отслеживает анимацию закрытия (предотвращает
                       повторное открытие пока закрывается)
   • _lbTouchTimer  — скрывает стрелки навигации через 1.5с после тача
   ============================================================ */
import { $ } from './dom.js'
import { getLightboxList, getLightboxIndex, setLightboxIndex } from './state.js'

let _lbTimer = null                          /* Таймер навигации (250мс задержка между фото) */
let _lbCloseTimer = null                     /* Таймер анимации закрытия (300мс) */
let _lbTouchTimer = null                     /* Таймер видимости стрелок на мобайле (1500мс) */
const _lbT = 'translate(-50%,-50%)'          /* Центрирование: сдвиг на -50% по обеим осям */

/* ============================================================
   ZOOM — состояние и утилиты
   
   _lbZoom хранит текущий scale и pan-смещение (в px, относительно
   центра лайтбокса). Трансформа wrapper'а:
     translate(panX, panY) scale(scale)
   
   Порядок CSS-трансформ (справа налево):
     1. scale(zoom) — зум от центра wrapper'а
     2. translate(pan) — сдвиг уже зумнутого контента
   Это даёт 1:1 соответствие пальца→движение при pan.
   ============================================================ */

const ZOOM_MIN = 1
const ZOOM_MAX = 5
const ZOOM_DOUBLE_TAP = 2.5                  /* Scale при double-tap */
const ZOOM_SNAP = 1.1                        /* Если zoom < 1.1 → сброс на 1x */

const _lbZoom = { scale: 1, x: 0, y: 0 }

/* Pinch-трекинг */
let _lbPinchActive = false
let _lbPinchStartDist = 0                    /* Расстояние между пальцами в начале pinch */
let _lbPinchStartScale = 1                   /* Zoom-scale в начале pinch */
let _lbPinchCenterX = 0                      /* Центр pinch (отн. центра лайтбокса) */
let _lbPinchCenterY = 0
let _lbZoomAtPinchX = 0                      /* Pan-смещение в начале pinch */
let _lbZoomAtPinchY = 0

/* Pan-трекинг (1 палец при zoom > 1) */
let _lbPanActive = false
let _lbPanStartX = 0
let _lbPanStartY = 0
let _lbZoomAtPanX = 0
let _lbZoomAtPanY = 0

/* Mouse-drag трекинг (десктоп) */
let _lbMousePanActive = false
let _lbMousePanStartX = 0
let _lbMousePanStartY = 0
let _lbMouseZoomStartX = 0
let _lbMouseZoomStartY = 0

/* Double-tap трекинг */
let _lbLastTapTime = 0
let _lbLastTapX = 0
let _lbLastTapY = 0

/* Click vs dblclick разделитель */
let _lbClickTimer = null

/* --- Применение zoom-трансформа к wrapper'у ---
   animate: true → плавный переход 0.3с (для double-tap / snap-back)
   animate: false → мгновенно (для pinch/pan — следует за пальцем) */
function _lbApplyZoom(animate = false) {
  const zoom = $('#lightboxZoom')
  if (!zoom) return
  const z = _lbZoom

  if (animate) {
    zoom.style.transition = 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)'
  } else {
    zoom.style.transition = 'none'
  }

  if (z.scale === 1 && z.x === 0 && z.y === 0) {
    zoom.style.transform = ''
    zoom.classList.remove('lightbox__zoom--zoomed')
  } else {
    zoom.style.transform = `translate(${z.x}px, ${z.y}px) scale(${z.scale})`
    zoom.classList.add('lightbox__zoom--zoomed')
  }
}

/* --- Сброс zoom на 1x --- */
function _lbResetZoom(animate = false) {
  _lbZoom.scale = 1
  _lbZoom.x = 0
  _lbZoom.y = 0
  _lbPinchActive = false
  _lbPanActive = false
  _lbMousePanActive = false
  _lbApplyZoom(animate)
}

/* --- Расстояние между двумя тач-точками --- */
function _lbTouchDist(t1, t2) {
  const dx = t1.clientX - t2.clientX
  const dy = t1.clientY - t2.clientY
  return Math.sqrt(dx * dx + dy * dy)
}

/* --- Координаты относительно центра лайтбокса ---
   Используется для расчёта точки zoom (pinch center, tap point, cursor). */
function _lbRelCenter(clientX, clientY) {
  const lb = $('#lightbox')
  if (!lb) return { x: 0, y: 0 }
  const r = lb.getBoundingClientRect()
  return { x: clientX - r.left - r.width / 2, y: clientY - r.top - r.height / 2 }
}

/* --- Зум к точке (cx, cy) — центр лайтбокса = (0,0) ---
   Формула: panNew = cx - (cx - panOld) × (scaleNew / scaleOld)
   Это сохраняет точку (cx, cy) неподвижной при изменении scale. */
function _lbZoomTo(newScale, cx, cy, animate = false) {
  newScale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, newScale))
  const oldScale = _lbZoom.scale
  if (oldScale === 0) return
  const ratio = newScale / oldScale
  _lbZoom.x = cx - (cx - _lbZoom.x) * ratio
  _lbZoom.y = cy - (cy - _lbZoom.y) * ratio
  _lbZoom.scale = newScale
  _lbApplyZoom(animate)
}

/* _lbSetLoading — переключает состояние загрузки.
   lb-loading → пульсирующая золотая линия внизу.
   lb-done → линия заполняется и исчезает. */
function _lbSetLoading(on) {
  const lb = $('#lightbox')
  if (!lb) return
  if (on) {
    lb.classList.add('lb-loading')
    lb.classList.remove('lb-done')
  } else {
    lb.classList.remove('lb-loading')
    lb.classList.add('lb-done')
  }
}

/* _lbLoadFull — загружает полноразмерное фото.
   Когда загрузилось → .loaded (проявляется поверх миниатюры) + убирает loading.
   При ошибке (404, сеть) — убирает loading, показываем миниатюру как есть. */
function _lbLoadFull(full, src, idx) {
  _lbSetLoading(true)
  full.onload = () => {
    if (getLightboxIndex() === idx) {         /* Проверяем индекс — пользователь мог уже уйти */
      full.classList.add('loaded')
      _lbSetLoading(false)
    }
  }
  full.onerror = () => {                       /* Ошибка загрузки — не зависаем в lb-loading */
    if (getLightboxIndex() === idx) {
      _lbSetLoading(false)
    }
  }
  full.src = src
  /* Кэш: если фото уже загружено — onload не сработает, проверяем вручную */
  if (full.complete && full.naturalWidth > 0) {
    full.classList.add('loaded')
    _lbSetLoading(false)
  }
}

/* --- openLightbox --- Открывает лайтбокс на фото с заданным индексом.
   Анимация: миниатюра зумится от 0.92→1 за 0.45с (cubic-bezier). */
export function openLightbox(index) {
  const lightbox = $('#lightbox')
  const thumb = $('#lightboxThumb')
  const full = $('#lightboxFull')
  const info = $('#lightboxInfo')
  const counter = $('#lightboxCounter')

  /* Если лайтбокс в процессе закрытия — отменяем таймер,
     чтобы не осталось в полузакрытом состоянии */
  if (_lbCloseTimer) {
    clearTimeout(_lbCloseTimer)
    _lbCloseTimer = null
  }

  _lbResetZoom()                               /* Сброс zoom — чистое состояние при открытии */

  setLightboxIndex(index)
  const photo = getLightboxList()[index]

  info.textContent = photo.title
  counter.textContent = `${index + 1} / ${getLightboxList().length}`

  /* Подготавливаем полный размер: скрываем */
  full.classList.remove('loaded')
  full.removeAttribute('src')                 /* Очищаем src — чтобы не показывало прошлое фото */

  /* Подготавливаем миниатюру: невидимая, маленькая, размытая */
  thumb.style.transition = 'none'            /* Без анимации — устанавливаем начальную позицию */
  thumb.style.opacity = '0'
  thumb.style.transform = `${_lbT} scale(0.92)` /* Чуть меньше — будет «вырастать» */
  thumb.style.filter = 'blur(25px)'          /* Сильно размытая — фокус на контуре, не на деталях */
  thumb.src = photo.thumb
  thumb.alt = photo.title

  /* Показываем лайтбокс */
  lightbox.classList.add('open')
  lightbox.classList.remove('lb-loading', 'lb-done')
  lightbox.setAttribute('aria-hidden', 'false')
  document.documentElement.classList.add('lightbox-open') /* Блокирует скролл (CSS: overflow:hidden) */
  document.documentElement.style.overflow = 'hidden'

  /* startZoom — когда миниатюра загрузилась, запускаем анимацию зума.
     Двойной requestAnimationFrame — гарантирует, что браузер отрендерил
     начальное состояние (opacity:0, scale:0.92) до начала transition. */
  const startZoom = () => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        thumb.style.transition = 'opacity 0.4s ease, transform 0.45s cubic-bezier(0.22,1,0.36,1), filter 0.8s ease'
        /* 0.4s появление, 0.45s зум, 0.8s размытие — разное время для «живого» ощущения */
        thumb.style.opacity = '1'
        thumb.style.transform = `${_lbT} scale(1)` /* 0.92 → 1: «вырастание» */
        thumb.style.filter = 'blur(25px)'    /* Остётся размытой — полный размер будет поверх */
      })
    })

    /* Параллельно загружаем полноразмерное фото */
    if (getLightboxIndex() === index) {
      _lbLoadFull(full, photo.src, index)
    }
  }

  /* Ждём загрузки миниатюры, потом запускаем зум */
  if (thumb.complete && thumb.naturalWidth > 0) {
    startZoom()                               /* Из кэша — сразу */
  } else {
    thumb.addEventListener('load', startZoom, { once: true }) /* После загрузки */
  }
}

/* --- closeLightbox --- Закрывает лайтбокс с анимацией.
   Миниатюра плавно уходит (opacity→0, scale→0.95) за 300мс.
   После завершения анимации — убираем DOM-классы и сбрасываем стили. */
export function closeLightbox() {
  const lightbox = $('#lightbox')
  const thumb = $('#lightboxThumb')
  const full = $('#lightboxFull')

  _lbResetZoom()                               /* Сброс zoom перед закрытием */

  /* Анимация ухода миниатюры */
  thumb.style.transition = 'opacity 0.3s ease, transform 0.3s ease'
  thumb.style.opacity = '0'
  thumb.style.transform = `${_lbT} scale(0.95)` /* Чуть уменьшается — эффект «схлопывания» */

  full.classList.remove('loaded')
  lightbox.classList.remove('lb-loading', 'lb-done')

  /* Отменяем навигацию если была в процессе */
  if (_lbTimer) {
    clearTimeout(_lbTimer)
    _lbTimer = null
  }

  /* СБРАСЫВАЕМ ИНДЕКС ДО setTimeout — иначе проверка ниже не сработает.
     Багфикс: раньше setLightboxIndex(-1) стоял ПОСЛЕ проверки,
     и return всегда срабатывал — лайтбокс не закрывался. */
  const closingIndex = getLightboxIndex()
  setLightboxIndex(-1)

  /* После анимации (300мс) — окончательно убираем лайтбокс */
  setTimeout(() => {
    /* Защита: если за 300мс успели открыть новое фото — не закрываем */
    if (getLightboxIndex() !== -1) return

    lightbox.classList.remove('open')
    lightbox.setAttribute('aria-hidden', 'true')
    document.documentElement.classList.remove('lightbox-open')
    document.documentElement.style.overflow = ''  /* Возвращаем скролл */

    /* Сбрасываем inline-стили — возвращаем к CSS-значениям */
    thumb.style.transition = ''
    thumb.style.opacity = ''
    thumb.style.transform = ''
    thumb.style.filter = ''
    full.removeAttribute('src')
    _lbCloseTimer = null
  }, 300) /* 300мс — совпадает с длительностью transition миниатюры */
}

/* --- navigateLightbox --- Переключает фото (вперёд/назад).
   direction: -1 = назад, +1 = вперёд.
   Циклическая навигация: после последнего → первый. */
export function navigateLightbox(direction) {
  if (getLightboxIndex() === -1) return       /* Лайтбокс закрыт — не навигируем */

  const thumb = $('#lightboxThumb')
  const full = $('#lightboxFull')

  /* Анимация ухода текущего фото */
  thumb.style.transition = 'opacity 0.25s ease, transform 0.25s ease'
  thumb.style.opacity = '0'
  thumb.style.transform = `${_lbT} scale(0.98)` /* Чуть уменьшается */
  full.classList.remove('loaded')

  const lb = $('#lightbox')
  if (lb) lb.classList.remove('lb-done')

  /* Отменяем предыдущую навигацию если была */
  if (_lbTimer) clearTimeout(_lbTimer)

  _lbResetZoom()                               /* Сброс zoom перед сменой фото */

  /* Ждём 250мс (анимация ухода) → показываем новое фото */
  _lbTimer = setTimeout(() => {
    const list = getLightboxList()
    let newIdx = getLightboxIndex() + direction
    if (newIdx < 0) newIdx = list.length - 1  /* Цикл: первый → последний */
    if (newIdx >= list.length) newIdx = 0      /* Цикл: последний → первый */

    setLightboxIndex(newIdx)
    const photo = list[newIdx]

    /* Обновляем текст */
    const info = $('#lightboxInfo')
    const counter = $('#lightboxCounter')
    if (info) info.textContent = photo.title
    if (counter) counter.textContent = `${newIdx + 1} / ${list.length}`

    /* Подготавливаем новую миниатюру */
    full.removeAttribute('src')
    thumb.src = photo.thumb
    thumb.alt = photo.title
    thumb.style.filter = 'blur(25px)'         /* Размытая — полный размер будет поверх */

    /* Анимация появления нового фото */
    const showNew = () => {
      requestAnimationFrame(() => {
        thumb.style.transition = 'opacity 0.3s ease, transform 0.35s cubic-bezier(0.22,1,0.36,1), filter 0.8s ease'
        thumb.style.opacity = '1'
        thumb.style.transform = `${_lbT} scale(1)`
      })
      _lbLoadFull(full, photo.src, newIdx)
    }

    if (thumb.complete && thumb.naturalWidth > 0) {
      showNew()
    } else {
      thumb.addEventListener('load', showNew, { once: true })
    }

    _lbTimer = null
  }, 250) /* 250мс — анимация ухода текущего фото */
}

/* --- initLightbox --- Регистрирует все обработчики событий.
   Вызывается один раз при загрузке страницы. */
export function initLightbox() {
  const lightbox = $('#lightbox')
  if (!lightbox) return

  const zoom = $('#lightboxZoom')
  const closeBtn = $('#lightboxClose')
  const prevBtn = $('#lightboxPrev')
  const nextBtn = $('#lightboxNext')

  /* Кнопки */
  if (closeBtn) closeBtn.addEventListener('click', closeLightbox)
  if (prevBtn) prevBtn.addEventListener('click', () => navigateLightbox(-1))
  if (nextBtn) nextBtn.addEventListener('click', () => navigateLightbox(1))

  /* --- Клик по тёмному фону ---
     Клик НЕ на фото (на тёмный фон): мгновенное закрытие —
     dblclick на пустом фоне бессмыслен, задержка не нужна.
     Клик НА фото при zoom=1: игнорируем — чтобы не закрывалось случайно.
     Клик НА фото при zoom>1: сброс zoom (с задержкой на dblclick). */
  if (zoom) {
    zoom.addEventListener('click', e => {
      const onPhoto = e.target.tagName === 'IMG'
      if (onPhoto && _lbZoom.scale <= 1) return    /* Клик по фото (не зумнут) — не закрываем */
      if (!onPhoto && _lbZoom.scale <= 1) {
        closeLightbox()                            /* Тап на тёмный фон — сразу закрыть */
        return
      }
      /* Клик по фото при zoom>1 — ждём возможный dblclick */
      if (_lbClickTimer) return
      _lbClickTimer = setTimeout(() => {
        _lbClickTimer = null
        _lbResetZoom(true)                        /* Плавный возврат zoom */
      }, 250)
    })

    zoom.addEventListener('dblclick', e => {
      if (_lbClickTimer) {
        clearTimeout(_lbClickTimer)
        _lbClickTimer = null
      }
      e.preventDefault()
      const rel = _lbRelCenter(e.clientX, e.clientY)
      if (_lbZoom.scale > 1) {
        _lbResetZoom(true)                       /* Плавный возврат к 1x */
      } else {
        _lbZoomTo(ZOOM_DOUBLE_TAP, rel.x, rel.y, true)  /* Плавный зум 2.5x от курсора */
      }
    })
  }

  /* --- Scroll wheel zoom (десктоп) ---
     Мультипликативный factor (×0.92 / ×1.08) — плавнее чем аддитивный.
     zoomTo от курсора — точка под курсором остаётся на месте. */
  if (zoom) {
    zoom.addEventListener('wheel', e => {
      if (!lightbox.classList.contains('open')) return
      e.preventDefault()
      const factor = e.deltaY > 0 ? 0.92 : 1.08
      const rel = _lbRelCenter(e.clientX, e.clientY)
      _lbZoomTo(_lbZoom.scale * factor, rel.x, rel.y)
      /* Автовозврат если zoom слишком мал */
      if (_lbZoom.scale < ZOOM_SNAP && _lbZoom.scale > ZOOM_MIN) {
        _lbResetZoom(true)
      }
    }, { passive: false })
  }

  /* --- Mouse drag pan (десктоп, при zoom > 1) ---
     mousedown на zoom-wrapper → начало перетаскивания.
     mousemove/mouseup на window — чтобы работать даже если
     курсор вышел за пределы лайтбокса. */
  if (zoom) {
    zoom.addEventListener('mousedown', e => {
      if (_lbZoom.scale <= 1) return             /* Не зумнут — не тянем */
      if (e.target.tagName !== 'IMG') return      /* Тянем только за фото */
      _lbMousePanActive = true
      _lbMousePanStartX = e.clientX
      _lbMousePanStartY = e.clientY
      _lbMouseZoomStartX = _lbZoom.x
      _lbMouseZoomStartY = _lbZoom.y
      e.preventDefault()
    })
  }

  window.addEventListener('mousemove', e => {
    if (!_lbMousePanActive) return
    _lbZoom.x = _lbMouseZoomStartX + (e.clientX - _lbMousePanStartX)
    _lbZoom.y = _lbMouseZoomStartY + (e.clientY - _lbMousePanStartY)
    _lbApplyZoom()
  })

  window.addEventListener('mouseup', () => {
    if (_lbMousePanActive) {
      _lbMousePanActive = false
      if (_lbZoom.scale < ZOOM_SNAP) {
        _lbResetZoom(true)
      }
    }
  })

  /* Клавиатура: Esc — закрыть, ←/→ — навигация */
  document.addEventListener('keydown', e => {
    if (!lightbox.classList.contains('open')) return
    if (e.key === 'Escape') closeLightbox()
    if (e.key === 'ArrowLeft') navigateLightbox(-1)
    if (e.key === 'ArrowRight') navigateLightbox(1)
  })

  /* --- Тач-навигация + zoom ---
     Свайп влево → следующее фото, вправо → предыдущее.
     Свайп вниз → закрыть лайтбокс.
     Pinch → zoom, pan → перетаскивание при zoom > 1.
     Double-tap → toggle zoom 1x ↔ 2.5x.
     
     Правила:
     • 2 пальца = pinch zoom (приоритет над всем)
     • 1 палец + zoom > 1 = pan (перетаскивание)
     • 1 палец + zoom = 1 = swipe (навигация / закрытие) */
  let touchStartX = 0
  let touchStartY = 0
  let touchStartFingers = 0                     /* Кол-во пальцев в начале жеста */

  lightbox.addEventListener('touchstart', e => {
    const touches = e.touches
    touchStartFingers = touches.length

    if (touches.length === 2 && zoom) {
      /* --- Pinch start ---
         Запоминаем: расстояние между пальцами, текущий zoom,
         центр pinch, текущее pan-смещение. */
      _lbPinchActive = true
      _lbPanActive = false
      _lbPinchStartDist = _lbTouchDist(touches[0], touches[1])
      _lbPinchStartScale = _lbZoom.scale
      const cx = (touches[0].clientX + touches[1].clientX) / 2
      const cy = (touches[0].clientY + touches[1].clientY) / 2
      const rel = _lbRelCenter(cx, cy)
      _lbPinchCenterX = rel.x
      _lbPinchCenterY = rel.y
      _lbZoomAtPinchX = _lbZoom.x
      _lbZoomAtPinchY = _lbZoom.y
    } else if (touches.length === 1) {
      touchStartX = touches[0].clientX
      touchStartY = touches[0].clientY

      if (_lbZoom.scale > 1) {
        /* --- Pan start (когда зумнут) --- */
        _lbPanActive = true
        _lbPanStartX = touches[0].clientX
        _lbPanStartY = touches[0].clientY
        _lbZoomAtPanX = _lbZoom.x
        _lbZoomAtPanY = _lbZoom.y
      }

      /* Показываем стрелки навигации при касании */
      if (prevBtn) prevBtn.style.opacity = '1'
      if (nextBtn) nextBtn.style.opacity = '1'
    }
  }, { passive: true })

  lightbox.addEventListener('touchmove', e => {
    const touches = e.touches

    if (_lbPinchActive && touches.length === 2 && zoom) {
      /* --- Pinch move ---
         Новый scale = стартовый scale × (текущее расстояние / стартовое).
         Пересчёт pan по формуле: panNew = center - (center - panOld) × ratio.
         Это сохраняет центр pinch неподвижным. */
      const dist = _lbTouchDist(touches[0], touches[1])
      const newScale = _lbPinchStartScale * (dist / _lbPinchStartDist)
      const clampedScale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, newScale))
      const ratio = clampedScale / _lbPinchStartScale
      _lbZoom.scale = clampedScale
      _lbZoom.x = _lbPinchCenterX - (_lbPinchCenterX - _lbZoomAtPinchX) * ratio
      _lbZoom.y = _lbPinchCenterY - (_lbPinchCenterY - _lbZoomAtPinchY) * ratio
      _lbApplyZoom()
    } else if (_lbPanActive && touches.length === 1) {
      /* --- Pan move (когда зумнут) ---
         1:1 соответствие: палец сдвинулся на N px → фото сдвигается на N px. */
      _lbZoom.x = _lbZoomAtPanX + (touches[0].clientX - _lbPanStartX)
      _lbZoom.y = _lbZoomAtPanY + (touches[0].clientY - _lbPanStartY)
      _lbApplyZoom()
    }
  }, { passive: true })

  lightbox.addEventListener('touchend', e => {
    /* --- Pinch end ---
       Если пальцев стало < 2 — pinch завершён.
       Если zoom оказался < ZOOM_SNAP → плавный возврат на 1x. */
    if (_lbPinchActive && e.touches.length < 2) {
      _lbPinchActive = false
      if (_lbZoom.scale < ZOOM_SNAP && _lbZoom.scale > ZOOM_MIN) {
        _lbResetZoom(true)
      }
    }

    /* --- Pan end ---
       Все пальцы убраны — pan завершён.
       Автовозврат если zoom оказался < ZOOM_SNAP. */
    if (_lbPanActive && e.touches.length === 0) {
      _lbPanActive = false
      if (_lbZoom.scale < ZOOM_SNAP) {
        _lbResetZoom(true)
      }
    }

    /* --- Swipe навигация ---
     Только когда: пальцев 0, zoom = 1, pinch/pan не активны,
     и жест начат одним пальцем. */
    if (e.touches.length === 0 && touchStartFingers === 1 && !_lbPinchActive && !_lbPanActive && _lbZoom.scale === 1) {
      const diffX = e.changedTouches[0].clientX - touchStartX
      const diffY = e.changedTouches[0].clientY - touchStartY

      /* Горизонтальный свайп (>50px, больше чем вертикальный) → навигация */
      if (Math.abs(diffX) > 50 && Math.abs(diffX) > Math.abs(diffY)) {
        navigateLightbox(diffX > 0 ? -1 : 1)   /* Свайп вправо = назад, влево = вперёд */
      }
      /* Вертикальный свайп вниз (>100px) → закрыть */
      if (Math.abs(diffY) > 100 && diffY > 0 && Math.abs(diffY) > Math.abs(diffX)) {
        closeLightbox()
      }
    }

    /* --- Double-tap ---
     Два тапа за < 300мс, в радиусе 30px → toggle zoom.
     При zoom > 1 → возврат на 1x. При zoom = 1 → зум 2.5x в точке тапа. */
    const now = Date.now()
    const tapX = e.changedTouches[0].clientX
    const tapY = e.changedTouches[0].clientY
    if (now - _lbLastTapTime < 300 && Math.abs(tapX - _lbLastTapX) < 30 && Math.abs(tapY - _lbLastTapY) < 30) {
      const rel = _lbRelCenter(tapX, tapY)
      if (_lbZoom.scale > 1) {
        _lbResetZoom(true)
      } else {
        _lbZoomTo(ZOOM_DOUBLE_TAP, rel.x, rel.y, true)
      }
      _lbLastTapTime = 0                        /* Предотвращаем тройной тап */
    } else {
      _lbLastTapTime = now
      _lbLastTapX = tapX
      _lbLastTapY = tapY
    }

    /* Скрываем стрелки через 1.5с — чтобы не мешали просмотру */
    if (_lbTouchTimer) clearTimeout(_lbTouchTimer)
    _lbTouchTimer = setTimeout(() => {
      if (prevBtn) prevBtn.style.opacity = ''
      if (nextBtn) nextBtn.style.opacity = ''
      _lbTouchTimer = null
    }, 1500)
  }, { passive: true })
}
