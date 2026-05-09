/* ============================================================
   HERO.JS — Частицы на первом экране
   
   Создаёт 25 золотых точек внутри .hero__particles.
   Каждая точка — div с классом .hero__particle, позиция
   и размер задаются рандомно. Анимация полёта — в CSS
   (@keyframes particleDrift в base.css).
   
   Без этого файла hero-секция будет без летающих частиц.
   ============================================================ */
import { $ } from './dom.js'

export function initParticles() {
  const container = $('#heroParticles')
  if (!container) return

  /* 25 частиц — достаточно для атмосферы, не перегружает GPU */
  for (let i = 0; i < 25; i++) {
    const particle = document.createElement('div')
    particle.className = 'hero__particle'

    /* Размер: 1–3.5px — мелкие, не грубые */
    const size = 1 + Math.random() * 2.5

    /* Позиция: случайно по горизонтали (0–100%),
       по вертикали — нижняя половина (50–100%),
       чтобы частицы летели снизу вверх */
    particle.style.left = `${Math.random() * 100}%`
    particle.style.top = `${50 + Math.random() * 50}%`

    /* Inline-стили для размера — у каждой частицы свой */
    particle.style.width = `${size}px`
    particle.style.height = `${size}px`

    /* Длительность анимации: 10–25с — медленные, спокойные.
       Задержка: 0–12с — появляются не все сразу, а постепенно */
    particle.style.animationDuration = `${10 + Math.random() * 15}s`
    particle.style.animationDelay = `${Math.random() * 12}s`

    container.appendChild(particle)
  }
}
