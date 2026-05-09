/* ============================================================
   STATE.JS — Глобальное состояние лайтбокса
   
   Лайтбокс нужно знать: какой список фото открыт и какой
   индекс сейчас показывается. Эти данные используются в
   lightbox.js (открытие, навигация, закрытие) и gallery.js /
   featured.js (передают список при открытии).
   
   Переменные модульные — не глобальные (let, не window).
   Доступ только через get/set-функции.
   ============================================================ */

let currentLightboxList = []    /* Массив фото-объектов: {src, thumb, title, ...} */
let currentLightboxIndex = -1   /* Текущий индекс в списке. -1 = лайтбокс закрыт */

export function getLightboxList() { return currentLightboxList }
export function setLightboxList(list) { currentLightboxList = list }

export function getLightboxIndex() { return currentLightboxIndex }
export function setLightboxIndex(idx) { currentLightboxIndex = idx }
