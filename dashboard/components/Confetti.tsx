'use client'

import { useEffect, useRef } from 'react'
import confetti from 'canvas-confetti'

// Helper function moved outside
const randomInRange = (min: number, max: number) => {
  return Math.random() * (max - min) + min
}

export function Confetti() {
  const triggered = useRef(false)

  useEffect(() => {
    triggered.current = false // Reset the trigger when component mounts/remounts
    
    if (!triggered.current) {
      triggered.current = true

      const duration = 8000 // Increased duration for a longer, gentler effect
      const animationEnd = Date.now() + duration
      const defaults = { startVelocity: 2, spread: 360, ticks: 480, zIndex: 0 }

      const interval: NodeJS.Timeout = setInterval(function() {
        const timeLeft = animationEnd - Date.now()

        if (timeLeft <= 0) {
          clearInterval(interval)
          return
        }

        const particleCount = 6 * (timeLeft / duration) // Reduced particle count for a gentler effect

        confetti(Object.assign({}, defaults, {
          particleCount,
          origin: { x: randomInRange(0.1, 1), y: 0 }, // Start slightly above the screen
          gravity: 0.4, // Reduced gravity for slower fall
          scalar: 0.8, // Smaller confetti pieces
          drift: 0.1, // Slight sideways drift
          colors: ['#22C55E', '#15803D', '#166534', '#14532D'], // Green shades to match theme
        }))
      }, 500) // Increased interval for less frequent confetti bursts

      return () => {
        clearInterval(interval)
        triggered.current = false // Reset when unmounted
      }
    }
  }, []) // Empty dependency array to run only on mount/unmount

  return null
} 