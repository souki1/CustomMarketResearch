import type { ComponentPropsWithoutRef, ElementType } from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { THEME_CARD } from '@/lib/uiTheme'

type CardProps<T extends ElementType = 'div'> = {
  as?: T
  className?: string
  children: React.ReactNode
} & Omit<ComponentPropsWithoutRef<T>, 'as' | 'className' | 'children'>

export function Card<T extends ElementType = 'div'>({
  as,
  className = '',
  children,
  ...rest
}: CardProps<T>) {
  const { theme } = useTheme()
  const tc = THEME_CARD[theme]
  const Component = (as ?? 'div') as ElementType
  const isButton = Component === 'button'

  const cardBaseClass = `${tc.rounded} p-4 transition-all duration-200 ${tc.surface}`

  return (
    <Component
      className={`${cardBaseClass} ${isButton ? `${tc.buttonHoverShadow} focus:outline-none focus:ring-2 ${tc.focusRing} focus:ring-offset-1 text-left` : ''} ${className}`.trim()}
      {...rest}
    >
      {children}
    </Component>
  )
}
