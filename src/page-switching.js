import { $, $$ } from './dom.js'
import { getIsGalleryPage, setIsGalleryPage } from './state.js'
import { renderGallery } from './gallery.js'
import { initScrollAnimations } from './scroll.js'

export function initPageSwitching() {
  const navGalleryBtn = $('#navGalleryBtn')
  const navBackBtn = $('#navBackBtn')
  const featuredMoreBtn = $('#featuredMoreBtn')
  const pageMain = $('#pageMain')
  const pageGallery = $('#pageGallery')

  function openGalleryPage(replace = false) {
    if (getIsGalleryPage()) return
    setIsGalleryPage(true)
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
    if (!getIsGalleryPage()) return
    setIsGalleryPage(false)
    document.documentElement.classList.remove('gallery-open')
    pageGallery.classList.remove('active')
    const lines = $('#galleryLines')
    if (lines) lines.classList.remove('active')
  }

  window.addEventListener('popstate', (e) => {
    if (e.state?.gallery) {
      if (!getIsGalleryPage()) {
        setIsGalleryPage(true)
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
      if (getIsGalleryPage()) {
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
