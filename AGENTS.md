<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`pnpx convex ai-files install`.

<!-- convex-ai-end -->

This project uses pnpm as package manager.

Design philosophy: minimal, no custom design work — use shadcn/ui components **as-is**
with the existing `styles/globals.css` and `components.json` config (style `base-luma`, hugeicons icon library).
No new design systems, no custom CSS beyond layout utility classes.
