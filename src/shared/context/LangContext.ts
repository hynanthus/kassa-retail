import { createContext } from 'react'

export type Language = 'ru' | 'kk' | 'en'

interface LangContextType {
  language: Language
  setLanguage: (language: Language) => void
}

export const LangContext = createContext<LangContextType | null>(null)
