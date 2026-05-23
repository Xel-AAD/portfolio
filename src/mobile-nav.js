/* ============================================================
MOBILE-NAV.JS — Бургер-меню на мобильных

На десктопе ссылки в ряд. На мобильном (≤768px) —
бургер-кнопка открывает панель справа с затемнением фона.

Четыре элемента:
• #navBurger — кнопка с тремя полосками
• .nav__links — панель со ссылками (выезжает справа)
• #navOverlay — затемнение фона
• #navClose — кнопка ✕ внутри панели

Открытие: burger.active + links.open + overlay.open + body overflow:hidden.
Закрытие: обратный процесс, или клик по overlay, или по ссылке.
============================================================ */
import { $ } from './dom.js'

export function initMobileNav() {
  const burger = $('#navBurger')
  const links = $('.nav__links')
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
