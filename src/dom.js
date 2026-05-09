/* ============================================================
   DOM.JS — Утилиты для поиска элементов
   
   Два коротких хелпера, чтобы не писать
   document.querySelector / document.querySelectorAll каждый раз.
   Используются во всех остальных JS-файлах.
   ============================================================ */

/* $(sel) — находит ПЕРВЫЙ элемент по CSS-селектору.
   Аналог document.querySelector.
   Пример: $('#lightbox') → элемент с id="lightbox" */
export const $ = (sel, ctx = document) => ctx.querySelector(sel)

/* $$(sel) — находит ВСЕ элементы по CSS-селектору, возвращает массив.
   Аналог [...document.querySelectorAll].
   Пример: $$('.anim-fade-up') → массив всех элементов с этим классом */
export const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)]
