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
let _headerTicking = false
let _headerNavLinks = []
let _headerSectionEls = []
let _headerPage = ''

function _updateActiveNav() {
  const header = $('#header')
  const page = _headerPage

  if (header && page === 'index') {
    header.classList.toggle('scrolled', window.scrollY > 60)
  }

  _headerNavLinks.forEach(link => {
    const href = link.getAttribute('href')
    let isActive = false

    if (page === 'index') {
      let activeId = ''
      for (const el of _headerSectionEls) {
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

export function initHeaderScroll() {
  const header = $('#header')
  _headerPage = window.__PAGE__
  _headerNavLinks = [...$$('#navLinks a')].filter(a => a.id !== 'navClose')

  let sections = []

  if (_headerPage === 'index') {
    sections = ['about', 'featured', 'services', 'contact']
  }

  if (_headerPage === 'portfolio' && header) {
    header.classList.add('header--hidden')
    const navLinksEl = document.getElementById('navLinks')
    if (navLinksEl) navLinksEl.style.display = 'none'
  } else if (header) {
    header.classList.remove('header--hidden')
    const navLinksEl = document.getElementById('navLinks')
    if (navLinksEl) navLinksEl.style.display = ''
  }

  _headerSectionEls = sections.map(id => document.getElementById(id)).filter(Boolean)

  if (!_headerInited) {
    _headerInited = true
    window.addEventListener('scroll', () => {
      if (!_headerTicking) {
        requestAnimationFrame(() => {
          _updateActiveNav()
          _headerTicking = false
        })
        _headerTicking = true
      }
    }, { passive: true })

    window.addEventListener('pageshow', () => { _headerTicking = false })
  }

  _updateActiveNav()
}


export function initHeroAnimations() {
  setTimeout(() => {
    $$('.hero .anim-fade-up').forEach(el => {
      el.classList.add('visible')
    })
  }, 200) 
}
