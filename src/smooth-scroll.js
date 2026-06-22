import Lenis from 'lenis'
import { onScroll } from './scroll-animations.js'

let lenis = null

export function initSmoothScroll() {
  if (lenis) return
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return

const isTouch = 'ontouchstart' in window

lenis = new Lenis({
lerp: isTouch ? 0.15 : 0.2,
smoothWheel: true,
wheelMultiplier: 1.2,
touchMultiplier: 1.5,
orientation: 'vertical',
gestureOrientation: 'vertical',
})

lenis.on('scroll', ({ scroll, progress }) => {
onScroll(scroll, progress)
})

function raf(time) {
lenis.raf(time)
requestAnimationFrame(raf)
}
requestAnimationFrame(raf)

window.__lenis = lenis
}

export function stopSmoothScroll() {
	if (lenis) lenis.stop()
}

export function startSmoothScroll() {
	if (lenis) lenis.start()
}

export function scrollToTop(immediate = false) {
  if (lenis) {
    lenis.scrollTo(0, { immediate })
  } else {
    window.scrollTo({ top: 0, behavior: immediate ? 'instant' : 'smooth' })
  }
}

function easeInOutQuint(t) {
	return t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2
}

export function scrollToAnchor(hash) {
	const target = document.querySelector(hash)
	if (!target) return false
	const y = target.getBoundingClientRect().top + window.scrollY
	if (lenis) {
		lenis.scrollTo(y, { easing: easeInOutQuint, duration: 1.6 })
	} else {
		const startY = window.scrollY
		const distance = y - startY
		if (distance === 0) return true
		const duration = Math.min(Math.max(Math.abs(distance) / 2000, 0.5), 2.0) * 1000
		const start = performance.now()
		function step(now) {
			const elapsed = now - start
			const progress = Math.min(elapsed / duration, 1)
			const eased = easeInOutQuint(progress)
			window.scrollTo(0, startY + distance * eased)
			if (progress < 1) requestAnimationFrame(step)
		}
		requestAnimationFrame(step)
	}
	return true
}

export function getLenis() {
	return lenis
}
