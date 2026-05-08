import { $ } from './dom.js'

export function initMobileNav() {
  const burger = $('#navBurger')
  const links = $('.nav__links')
  const overlay = $('#navOverlay')
  const closeBtn = $('#navClose')

  if (!burger || !links) return

  function closeMenu() {
    burger.classList.remove('active')
    links.classList.remove('open')
    if (overlay) overlay.classList.remove('open')
    document.body.style.overflow = ''
  }

  function openMenu() {
    burger.classList.add('active')
    links.classList.add('open')
    if (overlay) overlay.classList.add('open')
    document.body.style.overflow = 'hidden'
  }

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
