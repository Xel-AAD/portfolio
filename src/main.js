const $ = (sel, ctx = document) => ctx.querySelector(sel)
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)]

let photosData = null
let currentLightboxIndex = -1
const ROW_HEIGHT = 280
const ROW_HEIGHT_MOBILE = 180
const GAP = 3

async function init() {
  try {
    const response = await fetch('/api/photos')
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    photosData = await response.json()
  } catch (err) {
    console.error('Failed to load photos from API:', err)
    photosData = { photos: [] }
  }

  renderGallery()
  initLightbox()
  initScrollAnimations()
  initHeaderScroll()
  initMobileNav()
  initHeroAnimations()
  initResizeHandler()
}

function buildJustifiedRows(photos, containerWidth, targetRowHeight) {
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
    currentRowWidth += displayWidth

    if (currentRowWidth >= containerWidth) {
      const adjustedRowHeight = (containerWidth / currentRowWidth) * targetRowHeight
      rows.push({ items: currentRow, rowHeight: adjustedRowHeight })
      currentRow = []
      currentRowWidth = 0
    }
  }

  if (currentRow.length > 0) {
    const ratio = currentRow.reduce((sum, item) => sum + item.aspectRatio, 0)
    const lastRowHeight = Math.min(
      containerWidth / ratio,
      targetRowHeight * 1.2
    )
    rows.push({ items: currentRow, rowHeight: lastRowHeight })
  }

  return rows
}

function renderGallery() {
  const grid = $('#galleryGrid')
  grid.innerHTML = ''

  const containerWidth = grid.clientWidth
  const targetRowHeight = window.innerWidth <= 768 ? ROW_HEIGHT_MOBILE : ROW_HEIGHT

  if (!photosData.photos.length) return

  const rows = buildJustifiedRows(photosData.photos, containerWidth, targetRowHeight)

  rows.forEach((row, rowIndex) => {
    const rowEl = document.createElement('div')
    rowEl.className = 'gallery__row'
    rowEl.style.height = `${Math.round(row.rowHeight)}px`

    row.items.forEach((item) => {
      const itemEl = document.createElement('div')
      itemEl.className = 'gallery__item anim-fade-up'
      itemEl.style.width = `${Math.round(item.aspectRatio * row.rowHeight)}px`
      itemEl.style.height = `${Math.round(row.rowHeight)}px`

      const globalIndex = photosData.photos.findIndex(p => p.src === item.src)

      itemEl.innerHTML = `
        <img src="${item.thumb}" alt="${item.title}" loading="lazy" />
        <div class="gallery__item-overlay">
          <h3 class="gallery__item-title">${item.title}</h3>
          <p class="gallery__item-desc">${item.description}</p>
        </div>
      `

      itemEl.addEventListener('click', () => openLightbox(globalIndex))
      rowEl.appendChild(itemEl)
    })

    grid.appendChild(rowEl)
  })
}

function initResizeHandler() {
  let resizeTimer
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => {
      renderGallery()
      initScrollAnimations()
    }, 200)
  })
}

function initLightbox() {
  const lightbox = $('#lightbox')
  const closeBtn = $('#lightboxClose')
  const prevBtn = $('#lightboxPrev')
  const nextBtn = $('#lightboxNext')

  closeBtn.addEventListener('click', closeLightbox)
  prevBtn.addEventListener('click', () => navigateLightbox(-1))
  nextBtn.addEventListener('click', () => navigateLightbox(1))

  lightbox.addEventListener('click', e => {
    if (e.target === lightbox) closeLightbox()
  })

  document.addEventListener('keydown', e => {
    if (!lightbox.classList.contains('open')) return
    if (e.key === 'Escape') closeLightbox()
    if (e.key === 'ArrowLeft') navigateLightbox(-1)
    if (e.key === 'ArrowRight') navigateLightbox(1)
  })

  let touchStartX = 0
  lightbox.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX
  }, { passive: true })

  lightbox.addEventListener('touchend', e => {
    const diff = e.changedTouches[0].screenX - touchStartX
    if (Math.abs(diff) > 50) {
      navigateLightbox(diff > 0 ? -1 : 1)
    }
  }, { passive: true })
}

function openLightbox(index) {
  const lightbox = $('#lightbox')
  const img = $('#lightboxImg')
  const info = $('#lightboxInfo')
  const counter = $('#lightboxCounter')

  currentLightboxIndex = index
  const photo = photosData.photos[index]

  img.src = photo.src
  img.alt = photo.title
  info.textContent = photo.title
  counter.textContent = `${index + 1} / ${photosData.photos.length}`

  lightbox.classList.add('open')
  lightbox.setAttribute('aria-hidden', 'false')
  document.body.style.overflow = 'hidden'
}

function closeLightbox() {
  const lightbox = $('#lightbox')
  lightbox.classList.remove('open')
  lightbox.setAttribute('aria-hidden', 'true')
  document.body.style.overflow = ''
  currentLightboxIndex = -1
}

function navigateLightbox(direction) {
  if (currentLightboxIndex === -1) return

  let newIdx = currentLightboxIndex + direction
  if (newIdx < 0) newIdx = photosData.photos.length - 1
  if (newIdx >= photosData.photos.length) newIdx = 0

  openLightbox(newIdx)
}

function initScrollAnimations() {
  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible')
          observer.unobserve(entry.target)
        }
      })
    },
    { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
  )

  $$('.anim-fade-up:not(.visible)').forEach(el => observer.observe(el))
}

function initHeaderScroll() {
  const header = $('#header')
  let ticking = false

  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        header.classList.toggle('scrolled', window.scrollY > 60)
        ticking = false
      })
      ticking = true
    }
  })
}

function initMobileNav() {
  const burger = $('#navBurger')
  const links = $('.nav__links')

  burger.addEventListener('click', () => {
    burger.classList.toggle('active')
    links.classList.toggle('open')
  })

  $$('.nav__links a').forEach(link => {
    link.addEventListener('click', () => {
      burger.classList.remove('active')
      links.classList.remove('open')
    })
  })
}

function initHeroAnimations() {
  setTimeout(() => {
    $$('.hero .anim-fade-up').forEach(el => {
      el.classList.add('visible')
    })
  }, 200)
}

document.addEventListener('DOMContentLoaded', init)
