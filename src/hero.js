import { $ } from './dom.js'

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
