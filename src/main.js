


import { renderFeatured } from './featured.js'
import { initGallery, renderCurrentGallery } from './gallery.js'
import { initLightbox } from './lightbox.js'
import { initScrollAnimations, initHeaderScroll, initHeroAnimations } from './scroll.js'
import { initMobileNav } from './mobile-nav.js'
import { initParticles } from './hero.js'
import { setLightboxList } from './state.js'
import { initPageTransition } from './page-transition.js'
import { initSmoothScroll, scrollToTop, getLenis } from './smooth-scroll.js'
import { initScrollAnimations2, onScroll } from './scroll-animations.js'
import { initPreloader } from './preloader.js'

const SCROLL_KEY = '__scroll__'

function getScrollKey(page) {
  return SCROLL_KEY + page
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


  const savedScroll = sessionStorage.getItem(getScrollKey(page))
	if (savedScroll !== null) {
		const pos = parseInt(savedScroll, 10)
		requestAnimationFrame(() => {
			scrollToTop(true)
			if (pos > 0) {
				setTimeout(() => {
					if (window.__lenis) window.__lenis.scrollTo(pos, { immediate: true })
					else window.scrollTo({ top: pos, behavior: 'instant' })
				}, 50)
			}
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

try { initLightbox() } catch (e) { console.error('[init] initLightbox:', e) }
	try { initMobileNav() } catch (e) { console.error('[init] initMobileNav:', e) }
	try { initSmoothScroll() } catch (e) { console.error('[init] initSmoothScroll:', e) }
	try { initScrollAnimations2() } catch (e) { console.error('[init] initScrollAnimations2:', e) }
	try { initPreloader() } catch (e) { console.error('[init] initPreloader:', e) }
	initResizeHandler()
	try { initPageTransition() } catch (e) { console.error('[init] initPageTransition:', e) }

	if (!getLenis()) {
		let _nativeScrollTicking = false
		window.addEventListener('scroll', () => {
			if (!_nativeScrollTicking) {
				requestAnimationFrame(() => {
					const maxScroll = document.documentElement.scrollHeight - window.innerHeight
					const progress = maxScroll > 0 ? window.scrollY / maxScroll : 0
					onScroll(window.scrollY, progress)
					_nativeScrollTicking = false
				})
				_nativeScrollTicking = true
			}
		}, { passive: true })
	}
}

if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual'
}


window.addEventListener('beforeunload', () => {
sessionStorage.setItem(getScrollKey(window.__PAGE__), String(window.scrollY))
})

window.addEventListener('pagehide', () => {
sessionStorage.setItem(getScrollKey(window.__PAGE__), String(window.scrollY))
})


document.querySelector('.nav__logo')?.addEventListener('click', (e) => {
	if (window.__PAGE__ === 'index') {
		e.preventDefault()
		e.stopImmediatePropagation()
		const startY = window.scrollY
		if (startY === 0) return
		if (window.__lenis) {
			window.__lenis.scrollTo(0, { easing: (t) => t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2, duration: 1.6 })
		} else {
			const distance = -startY
			const duration = Math.min(Math.max(Math.abs(startY) / 2000, 0.5), 2.0) * 1000
			const startTime = performance.now()
			function step(now) {
				const elapsed = now - startTime
				const progress = Math.min(elapsed / duration, 1)
				const eased = progress < 0.5 ? 16 * progress * progress * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 5) / 2
				window.scrollTo(0, startY + distance * eased)
				if (progress < 1) requestAnimationFrame(step)
			}
			requestAnimationFrame(step)
		}
	} else {
		sessionStorage.setItem(getScrollKey('index'), '0')
	}
})

document.addEventListener('DOMContentLoaded', init)
