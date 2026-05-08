import { $, $$ } from './dom.js'
import { setLightboxList } from './state.js'
import { openLightbox } from './lightbox.js'

const ROW_HEIGHT = 350
const ROW_HEIGHT_MOBILE = 180

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function buildJustifiedRows(photos, containerWidth, targetRowHeight, gap = 5) {
  if (!photos.length || containerWidth <= 0) return []

  const rows = []
  let currentRow = []
  let currentRowWidth = 0

  for (const photo of photos) {
    const w = photo.width || targetRowHeight * 0.75
    const h = photo.height || targetRowHeight
    const aspectRatio = w / h
    const displayWidth = aspectRatio * targetRowHeight

    currentRow.push({ ...photo, aspectRatio, displayWidth })
    currentRowWidth += displayWidth + gap

    if (currentRowWidth - gap >= containerWidth) {
      const totalGap = (currentRow.length - 1) * gap
      const adjustedRowHeight = (containerWidth - totalGap) / currentRow.reduce((s, i) => s + i.aspectRatio, 0)

      currentRow.forEach(item => {
        item.displayWidth = item.aspectRatio * adjustedRowHeight
      })
      rows.push({ items: currentRow, rowHeight: adjustedRowHeight })
      currentRow = []
      currentRowWidth = 0
    }
  }

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

function renderGrid(photos) {
  const grid = $('#galleryGrid')
  if (!grid || !photos?.length) return
  grid.innerHTML = ''

  const style = getComputedStyle(grid)
  const containerWidth = grid.clientWidth
    - parseFloat(style.paddingLeft)
    - parseFloat(style.paddingRight)
  const gap = 5
  const targetRowHeight = window.innerWidth <= 768 ? ROW_HEIGHT_MOBILE : ROW_HEIGHT

  const rows = buildJustifiedRows(photos, containerWidth, targetRowHeight, gap)

  let globalIdx = 0

  rows.forEach((row) => {
    const rowEl = document.createElement('div')
    rowEl.className = 'gallery__row'
    rowEl.style.height = `${Math.round(row.rowHeight)}px`

    row.items.forEach((item) => {
      const itemIndex = globalIdx++

      const itemEl = document.createElement('div')
      itemEl.className = 'gallery__item anim-fade-up'
      itemEl.style.width = `${Math.round(item.displayWidth)}px`
      itemEl.style.height = `${Math.round(row.rowHeight)}px`

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
      img.src = item.thumb
      img.alt = item.title
      img.loading = 'lazy'
      picture.appendChild(img)

      const overlay = document.createElement('div')
      overlay.className = 'gallery__item-overlay'

      const title = document.createElement('h3')
      title.className = 'gallery__item-title'
      title.textContent = item.title

      const desc = document.createElement('p')
      desc.className = 'gallery__item-desc'
      desc.textContent = item.description

      overlay.appendChild(title)
      if (item.description) {
        const desc = document.createElement('p')
        desc.className = 'gallery__item-desc'
        desc.textContent = item.description
        overlay.appendChild(desc)
      }
      itemEl.appendChild(picture)
      itemEl.appendChild(overlay)

      itemEl.addEventListener('click', () => {
        setLightboxList(photos)
        openLightbox(itemIndex)
      })
      rowEl.appendChild(itemEl)
    })

    grid.appendChild(rowEl)
  })
}

let _currentPhotos = []

export function initGallery() {
  const galleryData = window.__GALLERY_DATA__
  if (!galleryData?.length) return

  const allPhotos = galleryData.flatMap(s => s.photos)
  const activeSession = window.__ACTIVE_SESSION__

  if (activeSession) {
    const session = galleryData.find(s => s.id === activeSession)
    if (session) {
      _currentPhotos = session.photos
    }
  } else {
    _currentPhotos = shuffle(allPhotos)
  }

  renderGrid(_currentPhotos)
  setLightboxList(_currentPhotos)

  const wrap = $('.gallery__filter-wrap')
  const toggle = $('#filterToggle')
  const dropdown = $('#filterDropdown')

  if (toggle && dropdown && wrap) {
    toggle.addEventListener('click', () => {
      const open = wrap.classList.toggle('gallery__filter-wrap--open')
      toggle.setAttribute('aria-expanded', String(open))
    })

    document.addEventListener('click', (e) => {
      if (!wrap.contains(e.target)) {
        wrap.classList.remove('gallery__filter-wrap--open')
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
            toggle.innerHTML = `${session.title}<span class="gallery__filter-arrow">&#9662;</span>`
          }
        } else {
          _currentPhotos = shuffle(allPhotos)
          toggle.innerHTML = `Все съёмки<span class="gallery__filter-arrow">&#9662;</span>`
        }

        wrap.classList.remove('gallery__filter-wrap--open')

        renderGrid(_currentPhotos)
        setLightboxList(_currentPhotos)

        const url = sessionId ? `/portfolio/?session=${sessionId}` : '/portfolio/'
        history.replaceState(null, '', url)

        import('./scroll.js').then(m => m.initScrollAnimations())
      })
    })
  }
}

export function renderCurrentGallery() {
  if (_currentPhotos.length) {
    renderGrid(_currentPhotos)
  }
}
