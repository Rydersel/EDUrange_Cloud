"use client"

import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { motion } from "framer-motion"
import { LockIcon, ArrowLeft, HomeIcon } from "lucide-react"

const InvalidPermissionPage = () => {
  const router = useRouter()

  const handleGoBack = () => {
    router.back()
  }

  const handleReturnHome = () => {
    router.push("/home")
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative"
        >
          <h1 className="text-8xl font-extrabold tracking-tighter bg-gradient-to-r from-red-500 to-orange-500 text-transparent bg-clip-text">
            403
          </h1>
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="flex justify-center mt-4"
          >
            <LockIcon className="h-16 w-16 text-red-500" />
          </motion.div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="space-y-4"
        >
          <h2 className="text-2xl font-bold">Access Restricted</h2>
          <p className="text-muted-foreground">
            You don't have the required permissions to access this area. This section requires administrator privileges.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mt-6">
            <Button variant="outline" onClick={handleGoBack} className="flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              Go Back
            </Button>
            <Button onClick={handleReturnHome} className="flex items-center gap-2">
              <HomeIcon className="h-4 w-4" />
              Dashboard
            </Button>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.5 }}
          className="mt-12 pt-6 border-t border-border/30"
        >
          <p className="text-xs text-muted-foreground">EDUrange Cloud • Cybersecurity Training Platform</p>
        </motion.div>
      </div>
    </div>
  )
}

export default InvalidPermissionPage

