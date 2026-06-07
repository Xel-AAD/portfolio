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
  {
    threshold: 0.1,                          
    rootMargin: '0px 0px -40px 0px'         
  }
)


export function initScrollAnimations() {
  $$('.anim-fade-up:not(.visible)').forEach(el => _scrollObserver.observe(el))
}


let _headerInited = false

export function initHeaderScroll() {
  const header = $('#header')
  let ticking = false
  const page = window.__PAGE__
  let sections = []
  let navLinks = [...$$('#navLinks a')].filter(a => a.id !== 'navClose')

  if (page === 'index') {

    sections = ['about', 'featured', 'services', 'contact']
  }

  if (page === 'portfolio' && header) {
    header.classList.add('header--hidden')
    const navLinksEl = document.getElementById('navLinks')
    if (navLinksEl) navLinksEl.style.display = 'none'
  } else if (header) {
    header.classList.remove('header--hidden')
    const navLinksEl = document.getElementById('navLinks')
    if (navLinksEl) navLinksEl.style.display = ''
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
      }

      link.classList.toggle('nav__link--active', isActive)
    })
  }

  if (!_headerInited) {
    _headerInited = true
    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          updateActiveNav()
          ticking = false
        })
        ticking = true
      }
    }, { passive: true })

    window.addEventListener('pageshow', () => { ticking = false })
  }

  updateActiveNav()
}


export function initHeroAnimations() {
  setTimeout(() => {
    $$('.hero .anim-fade-up').forEach(el => {
      el.classList.add('visible')
    })
  }, 200) 
}
