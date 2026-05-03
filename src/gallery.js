import { $ } from './dom.js'
import { getPortfolioData } from './api.js'
import { setLightboxList } from './state.js'
import { openLightbox } from './lightbox.js'

const ROW_HEIGHT = 280
const ROW_HEIGHT_MOBILE = 180

export function buildJustifiedRows(photos, containerWidth, targetRowHeight, gap = 3) {
  if (!photos.length || containerWidth <= 0) return []

  const rows = []
  let currentRow = []
  let currentRowWidth = 0

  for (const photo of photos) {
    const w = photo.width || targetRowHeight * 0.75
    const h = photo.height || targetRowHeight
    const aspectRatio = w / h
    const displayWidth = aspectRatio * targetRowHeight

    currentRow.push({ ...photo, aspectRatio, displayWidth })
    currentRowWidth += displayWidth + gap

    if (currentRowWidth - gap >= containerWidth) {
      const totalGap = (currentRow.length - 1) * gap
      const adjustedRowHeight = (containerWidth - totalGap) / currentRow.reduce((s, i) => s + i.aspectRatio, 0)

      currentRow.forEach(item => {
        item.displayWidth = item.aspectRatio * adjustedRowHeight
      })
      rows.push({ items: currentRow, rowHeight: adjustedRowHeight })
      currentRow = []
      currentRowWidth = 0
    }
  }

  if (currentRow.length > 0) {
    const totalGap = (currentRow.length - 1) * gap
    const totalAspect = currentRow.reduce((s, i) => s + i.aspectRatio, 0)
    const lastRowHeight = Math.min((containerWidth - totalGap) / totalAspect, targetRowHeight * 1.2)

    currentRow.forEach(item => {
      item.displayWidth = item.aspectRatio * lastRowHeight
    })
    rows.push({ items: currentRow, rowHeight: lastRowHeight })
  }

  return rows
}

export function renderGallery() {
  const portfolioData = getPortfolioData()
  const grid = $('#galleryGrid')
  if (!grid || !portfolioData.gallery?.length) return
  grid.innerHTML = ''

  const style = getComputedStyle(grid)
  const containerWidth = grid.clientWidth
    - parseFloat(style.paddingLeft)
    - parseFloat(style.paddingRight)
  const gap = 3
  const targetRowHeight = window.innerWidth <= 768 ? ROW_HEIGHT_MOBILE : ROW_HEIGHT

  const rows = buildJustifiedRows(portfolioData.gallery, containerWidth, targetRowHeight, gap)

  rows.forEach((row) => {
    const rowEl = document.createElement('div')
    rowEl.className = 'gallery__row'
    rowEl.style.height = `${Math.round(row.rowHeight)}px`

    row.items.forEach((item) => {
      const globalIndex = portfolioData.gallery.findIndex(p => p.src === item.src)

      const itemEl = document.createElement('div')
      itemEl.className = 'gallery__item anim-fade-up'
      itemEl.style.width = `${Math.round(item.displayWidth)}px`
      itemEl.style.height = `${Math.round(row.rowHeight)}px`

      const img = document.createElement('img')
      img.src = item.thumb
      img.alt = item.title
      img.loading = 'lazy'

      const overlay = document.createElement('div')
      overlay.className = 'gallery__item-overlay'

      const title = document.createElement('h3')
      title.className = 'gallery__item-title'
      title.textContent = item.title

      const desc = document.createElement('p')
      desc.className = 'gallery__item-desc'
      desc.textContent = item.description

      overlay.appendChild(title)
      overlay.appendChild(desc)
      itemEl.appendChild(img)
      itemEl.appendChild(overlay)

      itemEl.addEventListener('click', () => {
        setLightboxList(portfolioData.gallery)
        openLightbox(globalIndex)
      })
      rowEl.appendChild(itemEl)
    })

    grid.appendChild(rowEl)
  })
}
