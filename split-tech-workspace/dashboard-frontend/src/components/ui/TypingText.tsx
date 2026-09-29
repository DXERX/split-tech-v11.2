import { useEffect, useState } from 'react'

interface Props {
  text: string
  speed?: number       // ms per char
  delay?: number       // ms before starting
  className?: string
  cursor?: boolean
}

export default function TypingText({ text, speed = 40, delay = 0, className = '', cursor = true }: Props) {
  const [displayed, setDisplayed] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    setDisplayed('')
    setDone(false)
    let i = 0
    const timeout = setTimeout(() => {
      const id = setInterval(() => {
        i++
        setDisplayed(text.slice(0, i))
        if (i >= text.length) {
          setDone(true)
          clearInterval(id)
        }
      }, speed)
      return () => clearInterval(id)
    }, delay)
    return () => clearTimeout(timeout)
  }, [text, speed, delay])

  return (
    <span className={className}>
      {displayed}
      {cursor && !done && (
        <span className="inline-block w-0.5 h-[1em] bg-current align-middle mx-0.5 animate-pulse" />
      )}
    </span>
  )
}
