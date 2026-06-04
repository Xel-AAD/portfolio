


import { $ } from './dom.js'

export function initMobileNav() {
const burger = $('#navBurger')
const links = $('#navLinks')
const overlay = $('#navOverlay')
const closeBtn = $('#navClose')

if (!burger || !links) return

function closeMenu() {
burger.classList.remove('active')
burger.setAttribute('aria-expanded', 'false')
links.classList.remove('open')
if (overlay) {
overlay.classList.remove('open')
overlay.setAttribute('aria-hidden', 'true')
}
document.body.style.overflow = ''
}

function openMenu() {
burger.classList.add('active')
burger.setAttribute('aria-expanded', 'true')
links.classList.add('open')
if (overlay) {
overlay.classList.add('open')
overlay.setAttribute('aria-hidden', 'false')
}
document.body.style.overflow = 'hidden'
}

window.__closeMobileMenu = closeMenu

  burger.addEventListener('click', () => {
    if (links.classList.contains('open')) {
      closeMenu()
    } else {
      openMenu()
    }
  })

  if (overlay) overlay.addEventListener('click', closeMenu)

  if (closeBtn) closeBtn.addEventListener('click', closeMenu)

  const navLinks = links.querySelectorAll('a, button')
  Array.from(navLinks).forEach(link => {
    if (link.id === 'navClose') return
    link.addEventListener('click', closeMenu)
  })
}
