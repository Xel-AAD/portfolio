import { $ } from './dom.js'
import { getPortfolioData } from './api.js'
import { setLightboxList } from './state.js'
import { openLightbox } from './lightbox.js'

export function renderFeatured() {
  const portfolioData = getPortfolioData()
  const grid = $('#featuredGrid')
  if (!grid || !portfolioData.featured?.length) return
  grid.innerHTML = ''

  const style = getComputedStyle(grid)
  const containerWidth = grid.clientWidth
    - parseFloat(style.paddingLeft)
    - parseFloat(style.paddingRight)
  const gap = 10
  const isMobile = window.innerWidth <= 768
  const colCount = isMobile ? 2 : 4
  const colWidth = (containerWidth - (colCount - 1) * gap) / colCount

  const columns = Array.from({ length: colCount }, () => ({
    el: null,
    height: 0,
    items: [],
    imgHeights: []
  }))

  for (let i = 0; i < colCount; i++) {
    const colEl = document.createElement('div')
    colEl.className = 'featured__col'
    colEl.style.width = `${colWidth}px`
    columns[i].el = colEl
    grid.appendChild(colEl)
  }

  portfolioData.featured.forEach((photo, idx) => {
    const w = photo.width || 3
    const h = photo.height || 4
    const imgHeight = colWidth * (h / w)
    const shortest = columns.reduce((min, col, i) => col.height < columns[min].height ? i : min, 0)

    const itemEl = document.createElement('div')
    itemEl.className = 'featured__item anim-fade-up'
    itemEl.style.marginBottom = `${gap}px`

    const img = document.createElement('img')
    img.src = photo.thumb
    img.alt = photo.title
    img.loading = 'lazy'
    img.width = Math.round(colWidth)
    img.height = Math.round(imgHeight)

    const overlay = document.createElement('div')
    overlay.className = 'featured__item-overlay'

    const title = document.createElement('h3')
    title.className = 'featured__item-title'
    title.textContent = photo.title

    overlay.appendChild(title)
    itemEl.appendChild(img)
    itemEl.appendChild(overlay)

    itemEl.addEventListener('click', () => {
      setLightboxList(portfolioData.featured)
      openLightbox(idx)
    })

    columns[shortest].el.appendChild(itemEl)
    columns[shortest].height += imgHeight + gap
    columns[shortest].items.push(itemEl)
    columns[shortest].imgHeights.push(imgHeight)
  })

  const maxH = Math.max(...columns.map(c => c.height))

  columns.forEach(col => {
    const lastIdx = col.items.length - 1
    if (lastIdx < 0) return

    col.items[lastIdx].style.marginBottom = '0'

    const diff = maxH - col.height
    if (diff > 2) {
      const img = col.items[lastIdx].querySelector('img')
      if (img) {
        const newH = col.imgHeights[lastIdx] + diff
        img.style.height = `${Math.round(newH)}px`
        img.style.objectFit = 'cover'
      }
    }
  })
}
