import { createContext } from 'react'

// Lets any component open the Help panel at a specific glossary term without
// drilling a callback through every layer.
export const HelpContext = createContext(() => {})
