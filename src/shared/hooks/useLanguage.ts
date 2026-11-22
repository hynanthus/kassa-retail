import { useContext } from 'react'
import { LangContext } from '../context/LangContext'

export function useLanguage() {
  const context = useContext(LangContext)
  if (!context) {
    throw new Error('useLanguage must be used within a LangProvider')
  }
  return context
}
