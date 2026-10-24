"use client"

import {
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
  useUser,
} from "@clerk/nextjs"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { GlobalSearch } from "@/components/global-search"
import { SettingsMenu } from "@/components/settings-menu"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function AppHeader() {
  const pathname = usePathname()
  const { isSignedIn } = useUser()
  const searching = pathname === "/search" && isSignedIn
  const links = [
    { href: "/", label: "Home" },
    { href: "/discover", label: "Discover" },
    { href: "/stats", label: "Stats" },
  ]

  return (
    <header>
      <div
        className={cn(
          "mx-auto grid min-h-14 w-full max-w-6xl grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-[1fr_auto_1fr] sm:px-6",
          searching && "grid-cols-1 sm:grid-cols-1 lg:grid-cols-[1fr_auto_1fr]"
        )}
      >
        <Link
          href="/"
          className={cn(
            "w-fit font-semibold tracking-tight",
            searching && "hidden lg:block"
          )}
        >
          ShowList
        </Link>
        <nav
          aria-label="Main navigation"
          className={cn(
            "col-span-2 row-start-2 flex justify-center gap-5 sm:col-span-1 sm:col-start-2 sm:row-start-1",
            searching && "hidden lg:flex"
          )}
        >
          {links.map(({ href, label }) => {
            const active = pathname === href
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "text-sm transition-colors hover:text-foreground",
                  active
                    ? "font-medium text-foreground"
                    : "text-muted-foreground"
                )}
              >
                {label}
              </Link>
            )
          })}
        </nav>
        <div
          className={cn(
            "col-start-2 row-start-1 flex items-center justify-end gap-2 sm:col-start-3",
            searching && "col-start-1 sm:col-start-1 lg:col-start-3"
          )}
        >
          <Show when="signed-in">
            <GlobalSearch />
          </Show>
          <div
            className={cn(
              "flex items-center gap-2",
              searching && "hidden lg:flex"
            )}
          >
            <SettingsMenu />
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
        </div>
      </div>
    </header>
  )
}
