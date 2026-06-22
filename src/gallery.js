import { $, $$ } from './dom.js'
import { scrollToTop } from './smooth-scroll.js'
import { setLightboxList } from './state.js'
import { openLightbox } from './lightbox.js'

const GAP = 6
const LAZY_ROOT_MARGIN = '1000px 0px 1000px 0px'

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
        if (img.dataset.srcset) {
          img.srcset = img.dataset.srcset
          img.removeAttribute('data-srcset')
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
  lazyLoader.disconnect()
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
  img.dataset.src = photo.src.replace('/photos/', '/photos/thumbs/')
  img.dataset.srcset = `${photo.src.replace('/photos/', '/photos/mobile/')} 300w, ${photo.src.replace('/photos/', '/photos/thumbs/')} 800w`
    img.sizes = `${Math.round(colW)}px`
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

    let _overlayTimer = null
    itemEl.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return
      overlay.classList.remove('gallery__item-overlay--show')
      void overlay.offsetWidth
      overlay.classList.add('gallery__item-overlay--show')
      if (_overlayTimer) clearTimeout(_overlayTimer)
      _overlayTimer = setTimeout(() => {
        overlay.classList.remove('gallery__item-overlay--show')
        _overlayTimer = null
      }, 3000)
    })

    itemEl.addEventListener('click', () => {
      setLightboxList(photos)
      openLightbox(itemIndex)
    })

    columns[shortest].el.appendChild(itemEl)
    columns[shortest].height += itemHeight + GAP
  })
}

let _currentPhotos = []
let _galleryInited = false

function _updateToggleLabel(text) {
  const toggle = $('#filterToggle')
  if (!toggle) return
  toggle.textContent = text
  const arrow = document.createElement('span')
  arrow.className = 'gallery__filter-arrow'
  arrow.textContent = '\u25BE'
  toggle.appendChild(arrow)
}

export function initGallery() {
  const galleryData = window.__GALLERY_DATA__
  if (!galleryData?.length) return

  const allPhotos = galleryData.flatMap(s => s.photos)
  const activeSession = window.__ACTIVE_SESSION__
  if (window.__PAGE__ === 'portfolio' && window.__lenis) {
    window.__lenis.options.speed = 0.5
    window.__lenis.resize()
  } else if (window.__lenis) {
    window.__lenis.options.speed = 1.2
    window.__lenis.resize()
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

  const scrollTopBtn = $('#scrollTop')
  if (scrollTopBtn) {
    const show = window.scrollY > window.innerHeight * 2
    scrollTopBtn.classList.toggle('visible', show)
  }

  if (!_galleryInited) {
    _galleryInited = true

    let _scrollTicking = false
    const checkScroll = () => {
      const btn = $('#scrollTop')
      if (!btn) return
      const show = window.scrollY > window.innerHeight * 2
      btn.classList.toggle('visible', show)
      _scrollTicking = false
    }
    window.addEventListener('scroll', () => {
      if (!_scrollTicking) {
        requestAnimationFrame(checkScroll)
        _scrollTicking = true
      }
    }, { passive: true })

    document.addEventListener('click', (e) => {
      if (e.target.closest('#scrollTop')) {
        scrollToTop()
        return
      }

      const toggle = e.target.closest('#filterToggle')
      if (toggle) {
        const inner = $('.gallery__filter-inner')
        if (inner) {
          const open = inner.classList.toggle('gallery__filter-inner--open')
          toggle.setAttribute('aria-expanded', String(open))
        }
        return
      }

      const option = e.target.closest('.gallery__filter-option')
      if (option) {
        const sessionId = option.dataset.session
        const data = window.__GALLERY_DATA__
        const all = data ? data.flatMap(s => s.photos) : allPhotos

        $$('.gallery__filter-option').forEach(b => b.classList.remove('gallery__filter-option--active'))
        option.classList.add('gallery__filter-option--active')

        if (sessionId) {
          const session = data ? data.find(s => s.id === sessionId) : galleryData.find(s => s.id === sessionId)
          if (session) {
            _currentPhotos = session.photos
            _updateToggleLabel(session.title)
          }
        } else {
          _currentPhotos = shuffle(all, _seededRandom(_dayOfYear()))
          _updateToggleLabel('Все съёмки')
        }

        const inner = $('.gallery__filter-inner')
        const toggleEl = $('#filterToggle')
        if (inner) inner.classList.remove('gallery__filter-inner--open')
        if (toggleEl) toggleEl.setAttribute('aria-expanded', 'false')

        renderGrid(_currentPhotos)
        setLightboxList(_currentPhotos)

        const url = sessionId ? `/portfolio/?session=${sessionId}` : '/portfolio/'
        history.replaceState(null, '', url)
        return
      }

      const inner = $('.gallery__filter-inner')
      const toggleEl = $('#filterToggle')
      if (inner && !inner.contains(e.target)) {
        inner.classList.remove('gallery__filter-inner--open')
        if (toggleEl) toggleEl.setAttribute('aria-expanded', 'false')
      }
    })
  }
}

export function renderCurrentGallery() {
  if (_currentPhotos.length) {
    renderGrid(_currentPhotos)
  }
}
