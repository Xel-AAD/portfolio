import { $, $$ } from './dom.js'

const _scrollObserver = new IntersectionObserver(
  entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible')
        _scrollObserver.unobserve(entry.target)
      }
    })
  },
  { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
)

export function initScrollAnimations() {
  $$('.anim-fade-up:not(.visible)').forEach(el => _scrollObserver.observe(el))
}

export function initHeaderScroll() {
  const header = $('#header')
  let ticking = false

  const sections = ['about', 'featured', 'services', 'contact']
  const sectionEls = sections.map(id => document.getElementById(id)).filter(Boolean)
  const navLinks = $$('.nav__links a[href^="#"]')

  function updateActiveNav() {
    if (header) header.classList.toggle('scrolled', window.scrollY > 60)

    let activeId = ''
    for (const el of sectionEls) {
      const rect = el.getBoundingClientRect()
      if (rect.top <= 150) activeId = el.id
    }

    navLinks.forEach(link => {
      const href = link.getAttribute('href')
      const isActive = activeId !== '' && href === `#${activeId}`
      link.classList.toggle('nav__link--active', isActive)
    })
  }

  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        updateActiveNav()
        ticking = false
      })
      ticking = true
    }
  })

  updateActiveNav()
}

export function initHeroAnimations() {
  setTimeout(() => {
    $$('.hero .anim-fade-up').forEach(el => {
      el.classList.add('visible')
    })
  }, 200)
}
