import '@fontsource-variable/inter'
import '@fontsource-variable/source-serif-4'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Shell } from '@/components/Shell'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'THREAD · Off Day or Something More?', template: '%s · THREAD' },
  description:
    'An interactive long-term-care training simulation: learn a resident’s baseline, notice change, decide with what you know, communicate it, and review your reasoning. Synthetic data; not for clinical use.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-CA">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  )
}
