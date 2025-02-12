'use client'

import { useEffect, useState, useRef } from 'react'
import { motion, useAnimation } from 'framer-motion'

const frameImages = [
  'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/frame_0_delay-0.1s-hsguR2j86lNfklFkcuWk1xwt9xEHDO.png',  // Frame 0
  'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/frame_1_delay-0.1s-mdthco2gnXreQLW0dYMOhlqT5ZJPXZ.png',  // Frame 1
  'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/frame_2_delay-0.1s-uf7jHPsI5Fq3afo3M56qrBSkrQcaYm.png',  // Frame 2
  'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/frame_3_delay-0.1s-MQwvvQ94XvzaST2iYYypUBx5kHuRk2.png',  // Frame 3
  'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/frame_4_delay-0.1s-GqhJo0Hgs4b1qTRa32yY792xde6LwB.png',  // Frame 4
  'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/frame_5_delay-0.1s-wuc2kmx1Q8WOf4Vpb5nNYsIwMVDLDX.png',  // Frame 5
  'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/frame_6_delay-0.1s-m35DYtByhtLlZcm6OMl7jQWNIj8C2u.png',  // Frame 6
  'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/frame_7_delay-0.1s-vuEC9twhVjHjA0k7nYHzoHLMkirxjV.png',  // Frame 7
]

export function DancingFrog() {
  const [currentFrame, setCurrentFrame] = useState(0)
  const [width, setWidth] = useState(0)
  const controls = useAnimation()
  const isMounted = useRef(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const playPromiseRef = useRef<Promise<void> | null>(null)

  useEffect(() => {
    if (typeof Audio !== 'undefined') {
      console.log('Creating audio element')
      audioRef.current = new Audio('/sounds/frog.mp3')
      audioRef.current.volume = 0
      audioRef.current.loop = true
      
      // Preload the audio
      audioRef.current.load()
    }

    const updateWidth = () => {
      setWidth(window.innerWidth)
    }
    updateWidth()
    window.addEventListener('resize', updateWidth)
    isMounted.current = true
    
    return () => {
      window.removeEventListener('resize', updateWidth)
      isMounted.current = false
      // Cleanup audio
      if (audioRef.current) {
        // Wait for any pending play promise to resolve before cleaning up
        if (playPromiseRef.current) {
          playPromiseRef.current.then(() => {
            if (audioRef.current) {
              audioRef.current.pause()
              audioRef.current.currentTime = 0
            }
          }).catch(() => {
            // Ignore any play promise errors during cleanup
          })
        } else {
          audioRef.current.pause()
          audioRef.current.currentTime = 0
        }
      }
    }
  }, [])

  const fadeIn = async (audio: HTMLAudioElement) => {
    console.log('Starting fade in')
    try {
      // Store the play promise
      playPromiseRef.current = audio.play()
      await playPromiseRef.current
      console.log('Audio started playing')
      
      const steps = 20
      const increment = 0.3 / steps // Target volume is 0.3
      for (let i = 0; i <= steps && isMounted.current; i++) {
        audio.volume = i * increment
        await new Promise(resolve => setTimeout(resolve, 50))
      }
    } catch (error) {
      console.error('Error playing audio:', error)
      // Reset the play promise if it fails
      playPromiseRef.current = null
    }
  }

  const fadeOut = async (audio: HTMLAudioElement) => {
    try {
      // Only fade out if we have an active play promise
      if (playPromiseRef.current) {
        await playPromiseRef.current
        const steps = 20
        const decrement = audio.volume / steps
        for (let i = steps; i >= 0 && audio.volume > 0; i--) {
          audio.volume = i * decrement
          await new Promise(resolve => setTimeout(resolve, 50))
        }
      }
    } catch (error) {
      console.error('Error fading out audio:', error)
    }
  }

  useEffect(() => {
    if (width > 0 && isMounted.current) {
      const animate = async () => {
        // Start audio with fade in
        if (audioRef.current) {
          await fadeIn(audioRef.current)
        }

        const frameDuration = 100 // 100ms per frame (0.1s)
        const hopDistance = 75 // Distance to move during the jump frames
        const totalDistance = width + 200

        let position = 0

        while (position < totalDistance && isMounted.current) {
          // Standing frames (0-2)
          for (let i = 0; i < 3 && isMounted.current; i++) {
            setCurrentFrame(i)
            await new Promise(resolve => setTimeout(resolve, frameDuration))
          }

          // Jump frames (3-7)
          for (let i = 3; i < 8 && isMounted.current; i++) {
            setCurrentFrame(i)
            if (i >= 3 && i <= 6) {
              // Only move during the actual jump frames
              position += hopDistance / 4
              try {
                await controls.start({ 
                  x: -position,
                  transition: { duration: frameDuration / 1000 }
                })
              } catch (error) {
                // Animation was interrupted, component unmounted
                if (audioRef.current) {
                  await fadeOut(audioRef.current)
                  audioRef.current.pause()
                }
                return
              }
            } else {
              await new Promise(resolve => setTimeout(resolve, frameDuration))
            }
          }
        }

        // Animation complete, fade out audio
        if (audioRef.current && isMounted.current) {
          await fadeOut(audioRef.current)
          audioRef.current.pause()
        }
      }

      animate()
    }
  }, [width, controls])

  return (
    <motion.div
      className="fixed bottom-8 right-0"
      animate={controls}
      initial={{ x: 0 }}
    >
      <img 
        src={frameImages[currentFrame] || "/placeholder.svg"}
        alt="Hopping Frog"
        className="w-32 h-32 object-contain"
      />
    </motion.div>
  )
} 