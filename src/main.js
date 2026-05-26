/* ============================================================
MAIN.JS — Точка входа фронтенда

Вызывается при DOMContentLoaded. Инициализирует все модули
в зависимости от текущей страницы (window.__PAGE__).

Также:
• Восстанавливает позицию скролла из sessionStorage (per-page)
• Сохраняет позицию скролла при уходе (beforeunload, per-page)
• Логотип: скроллит наверх на главной (без перехода),
  на других страницах — переход на / без анимации
• Resize: перерисовывает галерею/featured при смене ширины
============================================================ */
import { renderFeatured } from './featured.js'
import { initGallery, renderCurrentGallery } from './gallery.js'
import { initLightbox } from './lightbox.js'
import { initScrollAnimations, initHeaderScroll, initHeroAnimations } from './scroll.js'
import { initMobileNav } from './mobile-nav.js'
import { initParticles } from './hero.js'
import { setLightboxList } from './state.js'
import { initPageTransition } from './page-transition.js'

const SCROLL_KEY = '__scroll__'

function getScrollKey(page) {
  return SCROLL_KEY + page
}

/* --- Resize-обработчик --- */
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

/* --- Главная функция инициализации --- */
function init() {
  const page = window.__PAGE__

  /* Восстановление скролла для текущей страницы */
  const savedScroll = sessionStorage.getItem(getScrollKey(page))
  if (savedScroll !== null) {
    requestAnimationFrame(() => {
      window.scrollTo({ top: parseInt(savedScroll, 10), behavior: 'instant' })
    })
  }

  if (page === 'index') {
    try { renderFeatured() } catch (e) { console.error('[init] renderFeatured:', e) }
    try { initScrollAnimations() } catch (e) { console.error('[init] initScrollAnimations:', e) }
    try { initHeaderScroll() } catch (e) { console.error('[init] initHeaderScroll:', e) }
    try { initHeroAnimations() } catch (e) { console.error('[init] initHeroAnimations:', e) }
    try { initParticles() } catch (e) { console.error('[init] initParticles:', e) }

    if (window.__LIGHTBOX_DATA__?.length) {
      setLightboxList(window.__LIGHTBOX_DATA__)
    }
  }

  if (page === 'portfolio') {
    try { initGallery() } catch (e) { console.error('[init] initGallery:', e) }
    try { initScrollAnimations() } catch (e) { console.error('[init] initScrollAnimations:', e) }
    try { initHeaderScroll() } catch (e) { console.error('[init] initHeaderScroll:', e) }
  }

  if (page === 'reviews') {
    try { initScrollAnimations() } catch (e) { console.error('[init] initScrollAnimations:', e) }
    try { initHeaderScroll() } catch (e) { console.error('[init] initHeaderScroll:', e) }
  }

  try { initLightbox() } catch (e) { console.error('[init] initLightbox:', e) }
  try { initMobileNav() } catch (e) { console.error('[init] initMobileNav:', e) }
  initResizeHandler()
  try { initPageTransition() } catch (e) { console.error('[init] initPageTransition:', e) }
}

if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual'
}

/* Перед уходом со страницы — сохраняем позицию скролла для текущей страницы */
window.addEventListener('beforeunload', () => {
sessionStorage.setItem(getScrollKey(window.__PAGE__), String(window.scrollY))
})

window.addEventListener('pagehide', () => {
sessionStorage.setItem(getScrollKey(window.__PAGE__), String(window.scrollY))
})

/* Логотип: на главной — smooth scroll наверх (без перехода, без анимации).
На других страницах — прямой переход на / без page-wash анимации
и со сбросом скролла главной. */
document.querySelector('.nav__logo')?.addEventListener('click', (e) => {
  if (window.__PAGE__ === 'index') {
    e.preventDefault()
    e.stopImmediatePropagation()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  } else {
    sessionStorage.setItem(getScrollKey('index'), '0')
  }
})

document.addEventListener('DOMContentLoaded', init)
