import type { ComponentPropsWithoutRef, ElementType } from 'react'

type CardProps<T extends ElementType = 'div'> = {
  as?: T
  className?: string
  children: React.ReactNode
} & Omit<ComponentPropsWithoutRef<T>, 'as' | 'className' | 'children'>

const cardBaseClass =
  'rounded-[12px] border border-app-separator bg-app-surface p-4'

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
      className={`${cardBaseClass} ${isButton ? 'hover:bg-app-fill focus:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/40 text-left' : ''} ${className}`.trim()}
      {...rest}
    >
      {children}
    </Component>
  )
}
