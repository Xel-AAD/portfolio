import { setPortfolioData, getPortfolioData } from './state.js'

export async function fetchPortfolio() {
  try {
    const response = await fetch('/api/portfolio')
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    setPortfolioData(await response.json())
  } catch (err) {
    console.error('Failed to load portfolio:', err)
    setPortfolioData({ featured: [], gallery: [], about: { photo: null } })
  }
}

export { getPortfolioData }
