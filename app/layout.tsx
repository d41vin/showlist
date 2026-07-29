import {
  ClerkProvider,
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs"
import { shadcn } from "@clerk/ui/themes"
import { Geist_Mono, Inter } from "next/font/google"

import "@/styles/globals.css"
import { AppHeader } from "@/components/app-header"
import { ConvexClientProvider } from "@/components/convex-client-provider"
import { ThemeProvider } from "@/components/theme-provider"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

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
