const $ = (sel, ctx = document) => ctx.querySelector(sel)
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)]

let portfolioData = null
let currentLightboxList = []
let currentLightboxIndex = -1
let isGalleryPage = false
const ROW_HEIGHT = 280
const ROW_HEIGHT_MOBILE = 180

async function init() {
  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual'
  }

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

  window.scrollTo(0, 0)
}

function renderAbout() {
  const photo = portfolioData.about?.photo
  const img = $('.about__photo')
  if (img && photo) {
    img.src = photo.thumb
    img.alt = photo.title
  }
}

function renderFeatured() {
  const grid = $('#featuredGrid')
  if (!grid || !portfolioData.featured?.length) return
  grid.innerHTML = ''

  const style = getComputedStyle(grid)
  const containerWidth = grid.clientWidth
    - parseFloat(style.paddingLeft)
    - parseFloat(style.paddingRight)
  const gap = 10
  const isMobile = window.innerWidth <= 768
  const colCount = isMobile ? 2 : 4
  const colWidth = (containerWidth - (colCount - 1) * gap) / colCount

  const columns = Array.from({ length: colCount }, () => ({
    el: null,
    height: 0,
    items: [],
    imgHeights: []
  }))

  for (let i = 0; i < colCount; i++) {
    const colEl = document.createElement('div')
    colEl.className = 'featured__col'
    colEl.style.width = `${colWidth}px`
    columns[i].el = colEl
    grid.appendChild(colEl)
  }

  portfolioData.featured.forEach((photo, idx) => {
    const w = photo.width || 3
    const h = photo.height || 4
    const imgHeight = colWidth * (h / w)
    const shortest = columns.reduce((min, col, i) => col.height < columns[min].height ? i : min, 0)

    const itemEl = document.createElement('div')
    itemEl.className = 'featured__item anim-fade-up'
    itemEl.style.marginBottom = `${gap}px`

    itemEl.innerHTML = `
      <img src="${photo.thumb}" alt="${photo.title}" loading="lazy"
           width="${Math.round(colWidth)}" height="${Math.round(imgHeight)}" />
      <div class="featured__item-overlay">
        <h3 class="featured__item-title">${photo.title}</h3>
      </div>
    `

    itemEl.addEventListener('click', () => {
      currentLightboxList = portfolioData.featured
      openLightbox(idx)
    })

    columns[shortest].el.appendChild(itemEl)
    columns[shortest].height += imgHeight + gap
    columns[shortest].items.push(itemEl)
    columns[shortest].imgHeights.push(imgHeight)
  })

  const maxH = Math.max(...columns.map(c => c.height))

  columns.forEach(col => {
    const lastIdx = col.items.length - 1
    if (lastIdx < 0) return

    col.items[lastIdx].style.marginBottom = '0'

    const diff = maxH - col.height
    if (diff > 2) {
      const img = col.items[lastIdx].querySelector('img')
      if (img) {
        const newH = col.imgHeights[lastIdx] + diff
        img.style.height = `${Math.round(newH)}px`
        img.style.objectFit = 'cover'
      }
    }
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
        renderFeatured()
        initScrollAnimations()
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

  function openGalleryPage(replace = false) {
    if (isGalleryPage) return
    isGalleryPage = true
    if (replace) {
      history.replaceState({ gallery: true }, '')
    } else {
      history.pushState({ gallery: true }, '')
    }
    document.documentElement.classList.add('gallery-open')
    pageGallery.classList.add('active')
    pageGallery.scrollTop = 0
    const lines = $('#galleryLines')
    if (lines) lines.classList.add('active')
    setTimeout(() => {
      renderGallery()
      initScrollAnimations()
    }, 50)
  }

  function closeGalleryPage() {
    if (!isGalleryPage) return
    isGalleryPage = false
    document.documentElement.classList.remove('gallery-open')
    pageGallery.classList.remove('active')
    const lines = $('#galleryLines')
    if (lines) lines.classList.remove('active')
  }

  window.addEventListener('popstate', (e) => {
    if (e.state?.gallery) {
      if (!isGalleryPage) {
        isGalleryPage = true
        document.documentElement.classList.add('gallery-open')
        pageGallery.classList.add('active')
        pageGallery.scrollTop = 0
        const lines = $('#galleryLines')
        if (lines) lines.classList.add('active')
        setTimeout(() => {
          renderGallery()
          initScrollAnimations()
        }, 50)
      }
    } else {
      closeGalleryPage()
    }
  })

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

  const navLogo = $('.nav__logo')
  if (navLogo) {
    navLogo.addEventListener('click', (e) => {
      if (isGalleryPage) {
        e.preventDefault()
        history.back()
        const hero = $('#hero')
        if (hero) hero.scrollIntoView({ behavior: 'smooth' })
      }
    })
  }

  if (navBackBtn) {
    navBackBtn.addEventListener('click', () => history.back())
  }

  let galleryTouchStartX = 0
  let galleryTouchStartY = 0
  pageGallery.addEventListener('touchstart', e => {
    galleryTouchStartX = e.changedTouches[0].screenX
    galleryTouchStartY = e.changedTouches[0].screenY
  }, { passive: true })

  pageGallery.addEventListener('touchend', e => {
    const diffX = e.changedTouches[0].screenX - galleryTouchStartX
    const diffY = e.changedTouches[0].screenY - galleryTouchStartY
    if (diffX > 80 && Math.abs(diffX) > Math.abs(diffY) * 1.5 && galleryTouchStartX < 50) {
      history.back()
    }
  }, { passive: true })

  if (history.state?.gallery) {
    openGalleryPage(true)
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
  let touchStartY = 0
  lightbox.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX
    touchStartY = e.changedTouches[0].screenY
    if (prevBtn) prevBtn.style.opacity = '1'
    if (nextBtn) nextBtn.style.opacity = '1'
  }, { passive: true })

  lightbox.addEventListener('touchend', e => {
    const diffX = e.changedTouches[0].screenX - touchStartX
    const diffY = e.changedTouches[0].screenY - touchStartY
    if (Math.abs(diffX) > 50 && Math.abs(diffX) > Math.abs(diffY)) {
      navigateLightbox(diffX > 0 ? -1 : 1)
    }
    if (Math.abs(diffY) > 100 && diffY > 0 && Math.abs(diffY) > Math.abs(diffX)) {
      closeLightbox()
    }
    setTimeout(() => {
      if (prevBtn) prevBtn.style.opacity = ''
      if (nextBtn) nextBtn.style.opacity = ''
    }, 1500)
  }, { passive: true })
}

let _lbTimer = null
const _lbT = 'translate(-50%,-50%)'

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

function _lbLoadFull(full, src, idx) {
  _lbSetLoading(true)
  full.onload = () => {
    if (currentLightboxIndex === idx) {
      full.classList.add('loaded')
      _lbSetLoading(false)
    }
  }
  full.src = src
  if (full.complete && full.naturalWidth > 0) {
    full.classList.add('loaded')
    _lbSetLoading(false)
  }
}

function openLightbox(index) {
  const lightbox = $('#lightbox')
  const thumb = $('#lightboxThumb')
  const full = $('#lightboxFull')
  const info = $('#lightboxInfo')
  const counter = $('#lightboxCounter')

  currentLightboxIndex = index
  const photo = currentLightboxList[index]

  info.textContent = photo.title
  counter.textContent = `${index + 1} / ${currentLightboxList.length}`

  full.classList.remove('loaded')
  full.removeAttribute('src')

  thumb.style.transition = 'none'
  thumb.style.opacity = '0'
  thumb.style.transform = `${_lbT} scale(0.92)`
  thumb.style.filter = 'blur(25px)'
  thumb.src = photo.thumb
  thumb.alt = photo.title

  lightbox.classList.add('open')
  lightbox.classList.remove('lb-loading', 'lb-done')
  lightbox.setAttribute('aria-hidden', 'false')
  document.body.style.overflow = 'hidden'

  const startZoom = () => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        thumb.style.transition = 'opacity 0.4s ease, transform 0.45s cubic-bezier(0.22,1,0.36,1), filter 0.8s ease'
        thumb.style.opacity = '1'
        thumb.style.transform = `${_lbT} scale(1)`
        thumb.style.filter = 'blur(25px)'
      })
    })

    if (currentLightboxIndex === index) {
      _lbLoadFull(full, photo.src, index)
    }
  }

  if (thumb.complete && thumb.naturalWidth > 0) {
    startZoom()
  } else {
    thumb.addEventListener('load', startZoom, { once: true })
  }
}

function closeLightbox() {
  const lightbox = $('#lightbox')
  const thumb = $('#lightboxThumb')
  const full = $('#lightboxFull')

  thumb.style.transition = 'opacity 0.3s ease, transform 0.3s ease'
  thumb.style.opacity = '0'
  thumb.style.transform = `${_lbT} scale(0.95)`

  full.classList.remove('loaded')
  lightbox.classList.remove('lb-loading', 'lb-done')

  if (_lbTimer) {
    clearTimeout(_lbTimer)
    _lbTimer = null
  }

  setTimeout(() => {
    lightbox.classList.remove('open')
    lightbox.setAttribute('aria-hidden', 'true')
    document.body.style.overflow = ''
    currentLightboxIndex = -1
    thumb.style.transition = ''
    thumb.style.opacity = ''
    thumb.style.transform = ''
    thumb.style.filter = ''
    full.removeAttribute('src')
  }, 300)
}

function navigateLightbox(direction) {
  if (currentLightboxIndex === -1) return

  const thumb = $('#lightboxThumb')
  const full = $('#lightboxFull')

  thumb.style.transition = 'opacity 0.25s ease, transform 0.25s ease'
  thumb.style.opacity = '0'
  thumb.style.transform = `${_lbT} scale(0.98)`
  full.classList.remove('loaded')

  const lb = $('#lightbox')
  if (lb) lb.classList.remove('lb-done')

  if (_lbTimer) clearTimeout(_lbTimer)

  _lbTimer = setTimeout(() => {
    let newIdx = currentLightboxIndex + direction
    if (newIdx < 0) newIdx = currentLightboxList.length - 1
    if (newIdx >= currentLightboxList.length) newIdx = 0

    currentLightboxIndex = newIdx
    const photo = currentLightboxList[newIdx]

    const info = $('#lightboxInfo')
    const counter = $('#lightboxCounter')
    if (info) info.textContent = photo.title
    if (counter) counter.textContent = `${newIdx + 1} / ${currentLightboxList.length}`

    full.removeAttribute('src')
    thumb.src = photo.thumb
    thumb.alt = photo.title
    thumb.style.filter = 'blur(25px)'

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
  }, 250)
}

function initScrollAnimations() {
  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible')
            observer.unobserve(entry.target)
        /*} else {
          entry.target.classList.remove('visible') */
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
    document.body.style.overflow = ''
  }

  function openMenu() {
    burger.classList.add('active')
    links.classList.add('open')
    if (overlay) overlay.classList.add('open')
    document.body.style.overflow = 'hidden'
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

  $$('.nav__links a, .nav__links button').forEach(link => {
    if (link.classList.contains('nav__menu-tg')) return
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
