import { $, $$ } from './dom.js'

export function initParticles() {
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

export function initParallax() {
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
