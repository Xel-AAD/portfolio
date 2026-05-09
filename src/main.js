/* ============================================================
   MAIN.JS — Точка входа фронтенда
   
   Вызывается при DOMContentLoaded. Инициализирует все модули
   в зависимости от текущей страницы (window.__PAGE__).
   
   Также:
   • Восстанавливает позицию скролла из sessionStorage
   • Сохраняет позицию скролла при уходе (beforeunload)
   • Логотип: скроллит наверх на главной, очищает scrollY на других
   • Resize: перерисовывает галерею/featured при смене ширины
   ============================================================ */
import { renderFeatured } from './featured.js'
import { initGallery, renderCurrentGallery } from './gallery.js'
import { initLightbox } from './lightbox.js'
import { initScrollAnimations, initHeaderScroll, initHeroAnimations } from './scroll.js'
import { initMobileNav } from './mobile-nav.js'
import { initParticles } from './hero.js'
import { setLightboxList } from './state.js'

/* --- Resize-обработчик ---
   При изменении ширины окна — перерисовывает сетки фото
   (featured или gallery), т.к. размеры зависят от containerWidth.
   debounce 200мс — не перерисовываем на каждый пиксель ресайза. */
function initResizeHandler() {
  let resizeTimer
  let lastWidth = window.innerWidth
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => {
      const newWidth = window.innerWidth
      if (newWidth !== lastWidth) {          /* Только если ширина реально изменилась (не только высота) */
        lastWidth = newWidth
        if (window.__PAGE__ === 'index') {
          renderFeatured()                  /* Перерасчёт masonry-сетки */
          initScrollAnimations()            /* Новые элементы нужно зарегистрировать */
        }
        if (window.__PAGE__ === 'portfolio') {
          renderCurrentGallery()            /* Перерасчёт justified-строк */
          initScrollAnimations()
        }
      }
    }, 200) /* 200мс debounce */
  })
}

/* --- Главная функция инициализации ---
   Вызывается один раз при загрузке страницы.
   Инициализирует модули в зависимости от типа страницы. */
function init() {
  const page = window.__PAGE__              /* Задаётся бэкендом в base.html: "index" / "portfolio" / "reviews" */
  const savedScroll = sessionStorage.getItem('scrollY')

  /* Главная страница: featured-сетка, hero-частицы, анимации */
  if (page === 'index') {
    renderFeatured()                         /* Рисует masonry-сетку из фото Favourites */
    initScrollAnimations()                   /* Регистрирует .anim-fade-up элементы в Observer */
    initHeaderScroll()                       /* Хедер: .scrolled при скролле + активная ссылка */
    initHeroAnimations()                     /* Мгновенное появление hero-элементов через 200мс */
    initParticles()                          /* 25 летающих золотых частиц */

    if (window.__LIGHTBOX_DATA__?.length) {
      setLightboxList(window.__LIGHTBOX_DATA__) /* Список фото для лайтбокса */
    }
  }

  /* Страница портфолио: галерея + фильтры */
  if (page === 'portfolio') {
    initGallery()                            /* Justified-сетка + фильтры по съёмкам */
    initScrollAnimations()
    initHeaderScroll()                       /* Хедер скрыт (.header--hidden) */
  }

  /* Страница отзывов: только анимации и хедер */
  if (page === 'reviews') {
    initScrollAnimations()
    initHeaderScroll()                       /* Хедер всегда с фоном (.scrolled) */
  }

  /* Общие модули для всех страниц */
  initLightbox()                             /* Клик по фото → полноэкранный просмотр */
  initMobileNav()                            /* Бургер-меню на мобильных */
  initResizeHandler()                        /* Перерисовка при ресайзе */

  /* Восстановление позиции скролла.
     requestAnimationFrame — чтобы DOM успел отрисоваться до скролла,
     иначе браузер может скроллить до рендера контента.
     behavior: 'instant' — мгновенный переход, без плавной прокрутки.
     Плавный scroll (CSS scroll-behavior: smooth) не нужен при восстановлении —
     пользователь ожидает оказаться сразу на том же месте. */
  if (savedScroll !== null) {
    requestAnimationFrame(() => {
      window.scrollTo({ top: parseInt(savedScroll, 10), behavior: 'instant' })
    })
  }
}

/* Отключаем браузерное автоматическое восстановление скролла —
   мы управляем этим сами через sessionStorage + scrollTo('instant').
   Без этого браузер может прокрутить дважды (свой + наш). */
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual'
}

/* Перед уходом со страницы — сохраняем текущую позицию скролла.
   При возврате (кнопка «Назад») — скролл восстановится.
   sessionStorage — живёт только в текущей вкладке. */
window.addEventListener('beforeunload', () => {
  sessionStorage.setItem('scrollY', String(window.scrollY))
})

/* Логотип: на главной — smooth scroll наверх (без перезагрузки),
   на других страницах — переход на / с очисткой scrollY
   (чтобы не восстановилась старая позиция с середины страницы). */
document.querySelector('.nav__logo')?.addEventListener('click', (e) => {
  sessionStorage.removeItem('scrollY')      /* Очищаем — чтобы / открылась с hero */
  if (window.__PAGE__ === 'index') {
    e.preventDefault()                       /* Не переходим по ссылке — скроллим */
    window.scrollTo({ top: 0, behavior: 'smooth' }) /* Плавный скролл наверх */
  }
})

document.addEventListener('DOMContentLoaded', init)
