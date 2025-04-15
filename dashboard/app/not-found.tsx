"use client"

import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Home, AlertTriangle } from "lucide-react"

export default function NotFound() {
  const router = useRouter()

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-md text-center">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-6"
        >
          <div className="relative">
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[10rem] font-extrabold text-muted-foreground/10">
              404
            </span>
            <span className="relative z-10 bg-gradient-to-r from-red-500 to-orange-500 bg-clip-text text-[8rem] font-extrabold text-transparent">
              404
            </span>
          </div>
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="flex justify-center"
          >
            <AlertTriangle className="h-16 w-16 text-orange-500" />
          </motion.div>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2, duration: 0.5 }}>
          <h2 className="font-heading mb-2 text-3xl font-bold tracking-tight">Challenge Not Found</h2>
          <p className="mb-8 text-muted-foreground">
            The resource you're looking for might have been terminated, moved, or never existed.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button onClick={() => router.back()} variant="outline" size="lg" className="w-full sm:w-auto gap-2">
              <ArrowLeft className="h-4 w-4" />
              Go Back
            </Button>
            <Button
              onClick={() => router.push("/dashboard")}
              variant="default"
              size="lg"
              className="w-full sm:w-auto gap-2"
            >
              <Home className="h-4 w-4" />
              Dashboard
            </Button>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="mt-12"
        >
          <div className="h-1 w-full rounded-full bg-gradient-to-r from-transparent via-border to-transparent" />
          <p className="mt-4 text-xs text-muted-foreground">EDUrange Cloud • Cybersecurity Training Platform</p>
        </motion.div>
      </div>
    </div>
  )
}

