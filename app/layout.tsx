import {
  ClerkProvider,
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs"
import { shadcn } from "@clerk/ui/themes"
import type { Metadata } from "next"
import { Geist_Mono, Inter } from "next/font/google"

import "@/styles/globals.css"
import { AiSettingsButton } from "@/components/ai-settings-dialog"
import { AppHeader } from "@/components/app-header"
import { ConvexClientProvider } from "@/components/convex-client-provider"
import { ThemeProvider } from "@/components/theme-provider"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: {
    default: "ShowList — track movies & TV",
    template: "%s · ShowList",
  },
  description:
    "A minimal tracker for movies and TV shows. Keep a watchlist, tick episodes you've seen, and see what airs next.",
}

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontMono.variable,
        "font-sans",
        inter.variable
      )}
    >
      <body suppressHydrationWarning>
        <ClerkProvider appearance={{ theme: shadcn }}>
          <ConvexClientProvider>
            <ThemeProvider>
              <header className="flex h-14 items-center justify-between gap-2 border-b px-6">
                <AppHeader />
                <div className="flex items-center gap-2">
                  <ThemeToggle />
                  <Show when="signed-out">
                    <SignInButton>
                      <Button variant="ghost" size="sm">
                        Sign in
                      </Button>
                    </SignInButton>
                    <SignUpButton>
                      <Button size="sm">Sign up</Button>
                    </SignUpButton>
                  </Show>
                  <Show when="signed-in">
                    <AiSettingsButton />
                    <UserButton />
                  </Show>
                </div>
              </header>
              {children}
            </ThemeProvider>
          </ConvexClientProvider>
        </ClerkProvider>
      </body>
    </html>
  )
}
