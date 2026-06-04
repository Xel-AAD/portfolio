


import { $$ } from './dom.js'

let progressEl = null
let parallaxEls = []
let countersDone = false

function initProgressBar() {
	progressEl = document.createElement('div')
	progressEl.className = 'scroll-progress'
	progressEl.setAttribute('aria-hidden', 'true')
	document.body.appendChild(progressEl)
}

function updateProgress(ratio) {
	if (!progressEl) return
	progressEl.style.transform = `scaleX(${ratio})`
	progressEl.style.opacity = ratio > 0.005 ? '1' : '0'
}

function initParallax() {
	parallaxEls = [...$$('[data-parallax]')].map(el => ({
		el,
		speed: parseFloat(el.dataset.parallax) || 0.05,
	}))
}

function updateParallax(scrollY) {
	for (const { el, speed } of parallaxEls) {
		const rect = el.getBoundingClientRect()
		const inView = rect.bottom > 0 && rect.top < window.innerHeight
		if (!inView) continue
		const offset = (rect.top - window.innerHeight / 2) * speed
		el.style.transform = `translateY(${offset}px)`
	}
}

function initCounters() {
	const counters = [...$$('[data-counter]')]
	if (!counters.length) return

	const observer = new IntersectionObserver(entries => {
		entries.forEach(entry => {
			if (!entry.isIntersecting) return
			const el = entry.target
			if (el.dataset.counted) return
			el.dataset.counted = '1'
			const target = parseInt(el.dataset.counter, 10)
			animateCounter(el, target)
			observer.unobserve(el)
		})
	}, { threshold: 0.3 })

	counters.forEach(el => observer.observe(el))
}

function animateCounter(el, target) {
	const duration = 1200
	const start = performance.now()
	const suffix = el.dataset.counterSuffix || ''

	function tick(now) {
		const t = Math.min((now - start) / duration, 1)
		const eased = 1 - Math.pow(1 - t, 3)
		const current = Math.round(target * eased)
		el.textContent = current.toLocaleString('ru-RU') + suffix
		if (t < 1) requestAnimationFrame(tick)
	}
	requestAnimationFrame(tick)
}

export function initScrollAnimations2() {
	if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
	initProgressBar()
	initParallax()
	initCounters()
}

export function onScroll(scrollY, progress) {
	updateProgress(progress)
	if (parallaxEls.length) updateParallax(scrollY)
}
