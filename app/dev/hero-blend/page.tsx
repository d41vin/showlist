import { notFound } from "next/navigation"
import { HeroBlendLab } from "@/components/dev/hero-blend-lab"

export const metadata = { title: "Hero blend lab" }

export default function HeroBlendPage() {
  if (process.env.NODE_ENV !== "development") notFound()
  return <HeroBlendLab />
}
