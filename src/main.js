import { renderFeatured } from './featured.js'
import { initGallery, renderCurrentGallery } from './gallery.js'
import { initLightbox } from './lightbox.js'
import { initScrollAnimations, initHeaderScroll, initHeroAnimations } from './scroll.js'
import { initMobileNav } from './mobile-nav.js'
import { initParticles } from './hero.js'
import { setLightboxList } from './state.js'

function initResizeHandler() {
  let resizeTimer
  let lastWidth = window.innerWidth
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => {
      const newWidth = window.innerWidth
      if (newWidth !== lastWidth) {
        lastWidth = newWidth
        if (window.__PAGE__ === 'index') {
          renderFeatured()
          initScrollAnimations()
        }
        if (window.__PAGE__ === 'portfolio') {
          renderCurrentGallery()
          initScrollAnimations()
        }
      }
    }, 200)
  })
}

function init() {
  const page = window.__PAGE__
  const savedScroll = sessionStorage.getItem('scrollY')

  if (page === 'index') {
    renderFeatured()
    initScrollAnimations()
    initHeaderScroll()
    initHeroAnimations()
    initParticles()

    if (window.__LIGHTBOX_DATA__?.length) {
      setLightboxList(window.__LIGHTBOX_DATA__)
    }
  }

  if (page === 'portfolio') {
    initGallery()
    initScrollAnimations()
    initHeaderScroll()
  }

  if (page === 'reviews') {
    initScrollAnimations()
    initHeaderScroll()
  }

  initLightbox()
  initMobileNav()
  initResizeHandler()

  if (savedScroll !== null) {
    requestAnimationFrame(() => {
      window.scrollTo(0, parseInt(savedScroll, 10))
    })
  }
}

window.addEventListener('beforeunload', () => {
  sessionStorage.setItem('scrollY', String(window.scrollY))
})

document.querySelector('.nav__logo')?.addEventListener('click', (e) => {
  sessionStorage.removeItem('scrollY')
  if (window.__PAGE__ === 'index') {
    e.preventDefault()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
})

document.addEventListener('DOMContentLoaded', init)
