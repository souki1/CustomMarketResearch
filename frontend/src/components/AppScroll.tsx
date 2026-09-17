import { forwardRef, type ReactNode } from 'react'

type AppScrollProps = {
  children: ReactNode
  className?: string
  viewportClassName?: string
  contentClassName?: string
}

/** Inset scroller: root > viewport > content. */
export const AppScroll = forwardRef<HTMLDivElement, AppScrollProps>(function AppScroll(
  { children, className = '', viewportClassName = '', contentClassName = '' },
  ref
) {
  return (
    <div className={['scroll--root', className].filter(Boolean).join(' ')}>
      <div ref={ref} className={['scroll--viewport', viewportClassName].filter(Boolean).join(' ')}>
        <div className={['scroll--content', contentClassName].filter(Boolean).join(' ')}>
          {children}
        </div>
      </div>
    </div>
  )
})
