/* ============================================================
   MOBILE-NAV.JS — Бургер-меню на мобильных
   
   На десктопе ссылки в ряд. На мобильном (≤768px) —
   бургер-кнопка открывает панель справа с затемнением фона.
   
   Четыре элемента:
   • #navBurger    — кнопка с тремя полосками
   • .nav__links  — панель со ссылками (выезжает справа)
   • #navOverlay  — затемнение фона
   • #navClose    — кнопка ✕ внутри панели
   
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

  /* Закрытие: убираем классы, возвращаем скролл */
  function closeMenu() {
    burger.classList.remove('active')
    links.classList.remove('open')
    if (overlay) overlay.classList.remove('open')
    document.body.style.overflow = ''       /* Разблокируем скролл страницы */
  }

  /* Открытие: добавляем классы, блокируем скролл */
  function openMenu() {
    burger.classList.add('active')           /* Три полоски → крестик (CSS анимация) */
    links.classList.add('open')             /* Панель выезжает (transform: translateX(100%) → 0) */
    if (overlay) overlay.classList.add('open') /* Затемнение фона */
    document.body.style.overflow = 'hidden' /* Блокируем скролл страницы под панелью */
  }

  /* Бургер: переключает меню (открыть/закрыть) */
  burger.addEventListener('click', () => {
    if (links.classList.contains('open')) {
      closeMenu()
    } else {
      openMenu()
    }
  })

  /* Overlay: клик по затемнению закрывает меню */
  if (overlay) overlay.addEventListener('click', closeMenu)

  /* Крестик ✕: закрывает меню */
  if (closeBtn) closeBtn.addEventListener('click', closeMenu)

  /* Ссылки внутри панели: клик по ссылке закрывает меню
     (чтобы не оставалось открытым после перехода к секции).
     #navClose исключён — у него свой обработчик выше. */
  const navLinks = links.querySelectorAll('a, button')
  Array.from(navLinks).forEach(link => {
    if (link.id === 'navClose') return
    link.addEventListener('click', closeMenu)
  })
}
