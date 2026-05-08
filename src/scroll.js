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

  const page = window.__PAGE__
  let sections = []
  let navLinks = $$('.nav__links a')

  if (page === 'index') {
    sections = ['about', 'featured', 'services', 'contact']
  }

  if (page === 'portfolio' && header) {
    header.classList.add('header--hidden')
  }

  if (page === 'reviews' && header) {
    header.classList.add('scrolled')
  }

  const sectionEls = sections.map(id => document.getElementById(id)).filter(Boolean)

  function updateActiveNav() {
    if (header && page === 'index') {
      header.classList.toggle('scrolled', window.scrollY > 60)
    }

    navLinks.forEach(link => {
      const href = link.getAttribute('href')
      let isActive = false

      if (page === 'index') {
        let activeId = ''
        for (const el of sectionEls) {
          const rect = el.getBoundingClientRect()
          if (rect.top <= 150) activeId = el.id
        }
        isActive = activeId !== '' && (href === `#${activeId}` || href === `/#${activeId}`)
      } else if (page === 'portfolio') {
        isActive = href === '/portfolio/'
      } else if (page === 'reviews') {
        isActive = href === '/reviews/'
      }

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
