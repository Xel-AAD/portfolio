const $ = (sel, ctx = document) => ctx.querySelector(sel)
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)]

let portfolioData = null
let currentLightboxList = []
let currentLightboxIndex = -1
let isGalleryPage = false
const ROW_HEIGHT = 280
const ROW_HEIGHT_MOBILE = 180

async function init() {
  try {
    const response = await fetch('/api/portfolio')
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    portfolioData = await response.json()
  } catch (err) {
    console.error('Failed to load portfolio:', err)
    portfolioData = { featured: [], gallery: [], about: { photo: null } }
  }

  renderAbout()
  renderFeatured()
  renderGallery()
  initLightbox()
  initScrollAnimations()
  initHeaderScroll()
  initMobileNav()
  initHeroAnimations()
  initParticles()
  initParallax()
  initResizeHandler()
  initPageSwitching()
}

function renderAbout() {
  const photo = portfolioData.about?.photo
  const img = $('.about__photo')
  if (img && photo) {
    img.src = photo.src
    img.alt = photo.title
  }
}

function renderFeatured() {
  const grid = $('#featuredGrid')
  if (!grid || !portfolioData.featured?.length) return

  portfolioData.featured.forEach((photo, idx) => {
    const item = document.createElement('div')
    item.className = 'featured__item anim-fade-up parallax-item'
    item.innerHTML = `
      <img src="${photo.thumb}" alt="${photo.title}" loading="lazy" />
      <div class="featured__item-overlay">
        <h3 class="featured__item-title">${photo.title}</h3>
        <p class="featured__item-desc">${photo.description}</p>
      </div>
    `
    item.addEventListener('click', () => {
      currentLightboxList = portfolioData.featured
      openLightbox(idx)
    })
    grid.appendChild(item)
  })
}

function buildJustifiedRows(photos, containerWidth, targetRowHeight, gap = 3) {
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

function renderGallery() {
  const grid = $('#galleryGrid')
  if (!grid || !portfolioData.gallery?.length) return
  grid.innerHTML = ''

  const style = getComputedStyle(grid)
  const containerWidth = grid.clientWidth
    - parseFloat(style.paddingLeft)
    - parseFloat(style.paddingRight)
  const gap = 3
  const targetRowHeight = window.innerWidth <= 768 ? ROW_HEIGHT_MOBILE : ROW_HEIGHT

  const rows = buildJustifiedRows(portfolioData.gallery, containerWidth, targetRowHeight, gap)

  rows.forEach((row) => {
    const rowEl = document.createElement('div')
    rowEl.className = 'gallery__row'
    rowEl.style.height = `${Math.round(row.rowHeight)}px`

    row.items.forEach((item) => {
      const globalIndex = portfolioData.gallery.findIndex(p => p.src === item.src)

      const itemEl = document.createElement('div')
      itemEl.className = 'gallery__item anim-fade-up'
      itemEl.style.width = `${Math.round(item.displayWidth)}px`
      itemEl.style.height = `${Math.round(row.rowHeight)}px`

      itemEl.innerHTML = `
        <img src="${item.thumb}" alt="${item.title}" loading="lazy" />
        <div class="gallery__item-overlay">
          <h3 class="gallery__item-title">${item.title}</h3>
          <p class="gallery__item-desc">${item.description}</p>
        </div>
      `

      itemEl.addEventListener('click', () => {
        currentLightboxList = portfolioData.gallery
        openLightbox(globalIndex)
      })
      rowEl.appendChild(itemEl)
    })

    grid.appendChild(rowEl)
  })
}

function initResizeHandler() {
  let resizeTimer
  let lastWidth = window.innerWidth
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => {
      const newWidth = window.innerWidth
      if (newWidth !== lastWidth) {
        lastWidth = newWidth
        if (isGalleryPage) {
          renderGallery()
          initScrollAnimations()
        }
      }
    }, 200)
  })
}

function initPageSwitching() {
  const navGalleryBtn = $('#navGalleryBtn')
  const navBackBtn = $('#navBackBtn')
  const featuredMoreBtn = $('#featuredMoreBtn')
  const pageMain = $('#pageMain')
  const pageGallery = $('#pageGallery')

  function openGalleryPage() {
    isGalleryPage = true
    pageMain.classList.add('hidden')
    pageGallery.classList.add('active')
    window.scrollTo(0, 0)
    setTimeout(() => {
      renderGallery()
      initScrollAnimations()
    }, 50)
  }

  if (navGalleryBtn) {
    navGalleryBtn.addEventListener('click', (e) => {
      e.preventDefault()
      openGalleryPage()
    })
  }

  if (featuredMoreBtn) {
    featuredMoreBtn.addEventListener('click', (e) => {
      e.preventDefault()
      openGalleryPage()
    })
  }

  if (navBackBtn) {
    navBackBtn.addEventListener('click', () => {
      isGalleryPage = false
      pageGallery.classList.remove('active')
      pageMain.classList.remove('hidden')
      window.scrollTo(0, 0)
    })
  }
}

function initParticles() {
  const container = $('#heroParticles')
  if (!container) return

  for (let i = 0; i < 25; i++) {
    const particle = document.createElement('div')
    particle.className = 'hero__particle'
    const size = 1 + Math.random() * 2.5
    particle.style.left = `${Math.random() * 100}%`
    particle.style.top = `${50 + Math.random() * 50}%`
    particle.style.width = `${size}px`
    particle.style.height = `${size}px`
    particle.style.animationDuration = `${10 + Math.random() * 15}s`
    particle.style.animationDelay = `${Math.random() * 12}s`
    container.appendChild(particle)
  }
}

function initParallax() {
  let ticking = false

  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        const items = $$('.parallax-item')
        items.forEach(item => {
          const rect = item.getBoundingClientRect()
          if (rect.top < window.innerHeight && rect.bottom > 0) {
            const offset = (rect.top / window.innerHeight) * 12
            item.style.transform = `translateY(${offset}px)`
          }
        })
        ticking = false
      })
      ticking = true
    }
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
  const photo = currentLightboxList[index]

  img.src = photo.src
  img.alt = photo.title
  info.textContent = photo.title
  counter.textContent = `${index + 1} / ${currentLightboxList.length}`

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
  if (newIdx < 0) newIdx = currentLightboxList.length - 1
  if (newIdx >= currentLightboxList.length) newIdx = 0

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
    { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
  )

  $$('.anim-fade-up:not(.visible)').forEach(el => observer.observe(el))
}

function initHeaderScroll() {
  const header = $('#header')
  let ticking = false

  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        if (header) header.classList.toggle('scrolled', window.scrollY > 60)
        ticking = false
      })
      ticking = true
    }
  })
}

function initMobileNav() {
  const burger = $('#navBurger')
  const links = $('.nav__links')
  const overlay = $('#navOverlay')
  const closeBtn = $('#navClose')

  if (!burger || !links) return

  function closeMenu() {
    burger.classList.remove('active')
    links.classList.remove('open')
    if (overlay) overlay.classList.remove('open')
  }

  function openMenu() {
    burger.classList.add('active')
    links.classList.add('open')
    if (overlay) overlay.classList.add('open')
  }

  burger.addEventListener('click', () => {
    if (links.classList.contains('open')) {
      closeMenu()
    } else {
      openMenu()
    }
  })

  if (overlay) overlay.addEventListener('click', closeMenu)
  if (closeBtn) closeBtn.addEventListener('click', closeMenu)

  $$('.nav__links a').forEach(link => {
    link.addEventListener('click', closeMenu)
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
