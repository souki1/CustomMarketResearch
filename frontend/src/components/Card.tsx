import type { ComponentPropsWithoutRef, ElementType } from 'react'

type CardProps<T extends ElementType = 'div'> = {
  as?: T
  className?: string
  children: React.ReactNode
} & Omit<ComponentPropsWithoutRef<T>, 'as' | 'className' | 'children'>

const cardBaseClass =
  'rounded-xl border border-gray-100 bg-white p-4 shadow-md transition-shadow'

export function Card<T extends ElementType = 'div'>({
  as,
  className = '',
  children,
  ...rest
}: CardProps<T>) {
  const Component = (as ?? 'div') as ElementType
  const isButton = Component === 'button'

  return (
    <Component
      className={`${cardBaseClass} ${isButton ? 'hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:ring-offset-1 text-left' : ''} ${className}`.trim()}
      {...rest}
    >
      {children}
    </Component>
  )
}
