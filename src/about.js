import { $ } from './dom.js'
import { getPortfolioData } from './api.js'

export function renderAbout() {
  const photo = getPortfolioData().about?.photo
  const img = $('.about__photo')
  if (img && photo) {
    img.src = photo.thumb
    img.alt = photo.title
    img.onerror = () => {
      img.style.display = 'none'
      const wrap = img.closest('.about__photo-wrap')
      if (wrap) wrap.style.display = 'none'
    }
  }
}
