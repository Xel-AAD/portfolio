import { fetchPortfolio } from './api.js'
import { renderAbout } from './about.js'
import { renderFeatured } from './featured.js'
import { renderGallery } from './gallery.js'
import { initLightbox } from './lightbox.js'
import { initScrollAnimations, initHeaderScroll, initHeroAnimations } from './scroll.js'
import { initMobileNav } from './mobile-nav.js'
import { initParticles, initParallax } from './hero.js'
import { initPageSwitching } from './page-switching.js'
import { getIsGalleryPage } from './state.js'

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
        if (getIsGalleryPage()) {
          renderGallery()
          initScrollAnimations()
        }
      }
    }, 200)
  })
}

async function init() {
  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual'
  }

  await fetchPortfolio()

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

document.addEventListener('DOMContentLoaded', init)
