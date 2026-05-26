/* ============================================================
GALLERY.JS — Masonry-сетка портфолио + фильтры по съёмкам

Masonry с неравными колонками (4 десктоп / 2 мобайл).
Колонки разной ширины — края размываются.
Одинаковый gap между всеми фото.
Каждое фото получает случайную высоту из диапазона:
- Portrait: высокая (380–560 десктоп, 240–380 мобайл)
- Landscape: низкая (240–360 десктоп, 150–240 мобайл)
============================================================ */
import { $, $$ } from './dom.js'
import { setLightboxList } from './state.js'
import { openLightbox } from './lightbox.js'

const GAP = 6
const LAZY_ROOT_MARGIN = '300px 0px 300px 0px'

const HEIGHT_RANGE_DESKTOP = { portrait: [380, 560], landscape: [240, 360] }
const HEIGHT_RANGE_MOBILE = { portrait: [240, 380], landscape: [150, 240] }

const COL_WEIGHTS_DESKTOP = [1.05, 0.95, 1.0, 1.0]
const COL_WEIGHTS_MOBILE = [1, 1]

function _seededRandom(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

function shuffle(arr, rng) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor((rng || Math.random)() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function _dayOfYear() {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 0)
  return Math.floor((now - start) / 86400000)
}

const lazyLoader = new IntersectionObserver(
  (entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target
        if (img.dataset.src) {
          img.src = img.dataset.src
          img.removeAttribute('data-src')
        }
        lazyLoader.unobserve(img)
      }
    })
  },
  {
    rootMargin: LAZY_ROOT_MARGIN,
    threshold: 0.01
  }
)

function renderGrid(photos) {
  const grid = $('#galleryGrid')
  if (!grid || !photos?.length) return
  grid.innerHTML = ''

  const style = getComputedStyle(grid)
  const containerWidth = grid.clientWidth
  - parseFloat(style.paddingLeft)
  - parseFloat(style.paddingRight)

  if (containerWidth <= 0) return

  const isMobile = window.innerWidth <= 768
  const colCount = isMobile ? 2 : 4
  const weights = isMobile ? COL_WEIGHTS_MOBILE : COL_WEIGHTS_DESKTOP
  const heightRange = isMobile ? HEIGHT_RANGE_MOBILE : HEIGHT_RANGE_DESKTOP
  const rng = _seededRandom(77)

  const totalWeight = weights.reduce((s, w) => s + w, 0)
  const totalGap = GAP * (colCount - 1)
  const available = containerWidth - totalGap
  const colWidths = weights.map(w => available * (w / totalWeight))

  const columns = Array.from({ length: colCount }, () => ({
    el: null,
    height: 0,
  }))

  for (let i = 0; i < colCount; i++) {
    const colEl = document.createElement('div')
    colEl.className = 'gallery__col'
    colEl.style.width = `${Math.round(colWidths[i])}px`
    if (i > 0) colEl.style.marginLeft = `${GAP}px`
    columns[i].el = colEl
    grid.appendChild(colEl)
  }

  let globalIdx = 0

  photos.forEach((photo) => {
    const itemIndex = globalIdx++
    const w = photo.width || 3
    const h = photo.height || 4
    const isLandscape = w > h
    const range = isLandscape ? heightRange.landscape : heightRange.portrait
    const itemHeight = Math.round(range[0] + rng() * (range[1] - range[0]))

    const shortest = columns.reduce((min, col, i) => col.height < columns[min].height ? i : min, 0)
    const colW = colWidths[shortest]

    const itemEl = document.createElement('div')
    itemEl.className = 'gallery__item'
    itemEl.style.width = `${Math.round(colW)}px`
    itemEl.style.height = `${itemHeight}px`
    itemEl.style.marginBottom = `${GAP}px`

    const img = document.createElement('img')
    img.dataset.src = photo.src
    img.alt = photo.title
    img.width = Math.round(colW)
    img.height = itemHeight

    lazyLoader.observe(img)

    const overlay = document.createElement('div')
    overlay.className = 'gallery__item-overlay'

    const title = document.createElement('h3')
    title.className = 'gallery__item-title'
    title.textContent = photo.title

    overlay.appendChild(title)
    if (photo.description) {
      const desc = document.createElement('p')
      desc.className = 'gallery__item-desc'
      desc.textContent = photo.description
      overlay.appendChild(desc)
    }

    itemEl.appendChild(img)
    itemEl.appendChild(overlay)

    itemEl.addEventListener('click', () => {
      setLightboxList(photos)
      openLightbox(itemIndex)
    })

    columns[shortest].el.appendChild(itemEl)
    columns[shortest].height += itemHeight + GAP
  })
}

let _currentPhotos = []

export function initGallery() {
const galleryData = window.__GALLERY_DATA__
if (!galleryData?.length) return

const allPhotos = galleryData.flatMap(s => s.photos)
const activeSession = window.__ACTIVE_SESSION__

const scrollTopBtn = $('#scrollTop')
if (scrollTopBtn) {
let _scrollTicking = false
const checkScroll = () => {
const show = window.scrollY > window.innerHeight * 2
scrollTopBtn.classList.toggle('visible', show)
_scrollTicking = false
}
window.addEventListener('scroll', () => {
if (!_scrollTicking) {
requestAnimationFrame(checkScroll)
_scrollTicking = true
}
}, { passive: true })
checkScroll()
scrollTopBtn.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' })
})
}

if (activeSession) {
const session = galleryData.find(s => s.id === activeSession)
if (session) {
_currentPhotos = session.photos
}
} else {
_currentPhotos = shuffle(allPhotos, _seededRandom(_dayOfYear()))
}

renderGrid(_currentPhotos)
setLightboxList(_currentPhotos)

const inner = $('.gallery__filter-inner')
const toggle = $('#filterToggle')
const dropdown = $('#filterDropdown')

function _updateToggleLabel(text) {
if (!toggle) return
toggle.textContent = text
const arrow = document.createElement('span')
arrow.className = 'gallery__filter-arrow'
arrow.textContent = '\u25BE'
toggle.appendChild(arrow)
}

window.addEventListener('popstate', () => {
const params = new URLSearchParams(window.location.search)
const sessionId = params.get('session') || ''

if (sessionId) {
const session = galleryData.find(s => s.id === sessionId)
if (session) {
_currentPhotos = session.photos
_updateToggleLabel(session.title)
}
} else {
_currentPhotos = shuffle(allPhotos, _seededRandom(_dayOfYear()))
_updateToggleLabel('Все съёмки')
}

$$('.gallery__filter-option').forEach(b => b.classList.remove('gallery__filter-option--active'))
const activeBtn = document.querySelector(`.gallery__filter-option[data-session="${sessionId}"]`)
if (activeBtn) activeBtn.classList.add('gallery__filter-option--active')

renderGrid(_currentPhotos)
setLightboxList(_currentPhotos)
})

if (toggle && dropdown && inner) {
toggle.addEventListener('click', () => {
const open = inner.classList.toggle('gallery__filter-inner--open')
toggle.setAttribute('aria-expanded', String(open))
})

document.addEventListener('click', (e) => {
if (!inner.contains(e.target)) {
inner.classList.remove('gallery__filter-inner--open')
toggle.setAttribute('aria-expanded', 'false')
}
})

$$('.gallery__filter-option').forEach(btn => {
btn.addEventListener('click', () => {
const sessionId = btn.dataset.session

$$('.gallery__filter-option').forEach(b => b.classList.remove('gallery__filter-option--active'))
btn.classList.add('gallery__filter-option--active')

if (sessionId) {
const session = galleryData.find(s => s.id === sessionId)
if (session) {
_currentPhotos = session.photos
_updateToggleLabel(session.title)
}
} else {
_currentPhotos = shuffle(allPhotos, _seededRandom(_dayOfYear()))
_updateToggleLabel('Все съёмки')
}

inner.classList.remove('gallery__filter-inner--open')
toggle.setAttribute('aria-expanded', 'false')

renderGrid(_currentPhotos)
setLightboxList(_currentPhotos)

const url = sessionId ? `/portfolio/?session=${sessionId}` : '/portfolio/'
history.replaceState(null, '', url)
})
})
}
}

export function renderCurrentGallery() {
if (_currentPhotos.length) {
renderGrid(_currentPhotos)
}
}
