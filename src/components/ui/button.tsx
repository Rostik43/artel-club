import React from 'react'

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'outline'
  className?: string
}

export function Button({ variant = 'default', className = '', ...props }: Props) {
  const base =
    'inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-2xl border transition'
  const variants = {
    default: 'bg-black text-white border-black hover:opacity-90',
    outline: 'bg-white text-black border-black hover:bg-neutral-100',
  } as const

  return (
    <button
      className={`${base} ${variants[variant]} ${className}`}
      {...props}
    />
  )
}

export default Button