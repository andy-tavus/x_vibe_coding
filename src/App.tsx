import { useCallback, useEffect, useState } from 'react'
import { CVIProvider } from './components/cvi/components/cvi-provider'
import { Conversation } from './components/cvi/components/conversation'
import { MagicCanvas } from './components/cvi/components/magic-canvas'
import type { CanvasInteractionEvent } from './components/cvi/components/magic-canvas/runtime'
import { useSendAppMessage } from './components/cvi/hooks/cvi-events-hooks'
import {
  createTavusConversation,
  endTavusConversation,
} from './components/cvi/lib/tavus-client'

const PAL_ID = 'p4633735d729'
const ZOOM_KEY = 'kinder-zoom'
const STEPS = [1, 1.15, 1.3]

// A closed picture sends nothing to the PAL, so it would wait for the student to type.
function LessonCanvas() {
  const sendAppMessage = useSendAppMessage()
  const onInteraction = useCallback(
    (event: CanvasInteractionEvent) => {
      if (event.component !== 'canvas.image' || event.type !== 'dismiss') return
      sendAppMessage({
        message_type: 'conversation',
        event_type: 'conversation.respond',
        conversation_id: event.conversation_id,
        properties: { text: 'Next.' },
      })
    },
    [sendAppMessage],
  )
  return <MagicCanvas className="lesson-canvas" onInteraction={onInteraction} />
}

export default function App() {
  const [zoom, setZoom] = useState(1)
  const [url, setUrl] = useState<string | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    const saved = Number(localStorage.getItem(ZOOM_KEY))
    if (STEPS.indexOf(saved) !== -1) setZoom(saved)
  }, [])

  useEffect(() => {
    document.documentElement.style.setProperty('--z', String(zoom))
    localStorage.setItem(ZOOM_KEY, String(zoom))
  }, [zoom])

  function changeZoom(direction: -1 | 1) {
    setZoom((current) => {
      const index = Math.max(0, STEPS.indexOf(current))
      return STEPS[Math.min(STEPS.length - 1, Math.max(0, index + direction))]
    })
  }

  async function start() {
    setStarting(true)
    setError('')
    try {
      const data = await createTavusConversation({
        pal_id: PAL_ID,
        conversation_name: 'First grade app plan',
        properties: {
          enable_closed_captions: true,
          max_call_duration: 3600,
        },
      })
      setConversationId(data.conversation_id)
      setUrl(data.conversation_url)
    } catch {
      setError('The lesson did not start. Try again.')
    } finally {
      setStarting(false)
    }
  }

  const leave = useCallback(async () => {
    const id = conversationId
    setUrl(null)
    setConversationId(null)
    if (id) {
      try {
        await endTavusConversation(id)
      } catch {
        // The room may already have ended.
      }
    }
  }, [conversationId])

  const zoomLabel = `${Math.round(zoom * 100)}%`

  return (
    <div id="app">
      <header className="bar">
        <h1>Vibe-Coding with Puppet Mr. Wertner</h1>
        <div id="zoom">
          <button type="button" aria-label="Zoom out" onClick={() => changeZoom(-1)}>
            −
          </button>
          <span>{zoomLabel}</span>
          <button type="button" aria-label="Zoom in" onClick={() => changeZoom(1)}>
            +
          </button>
        </div>
      </header>
      {url ? (
        <CVIProvider>
          <div className="call">
            <Conversation conversationUrl={url} onLeave={leave} />
            <LessonCanvas />
          </div>
        </CVIProvider>
      ) : (
        <main className="start">
          <button type="button" onClick={start} disabled={starting}>
            {starting ? 'Starting.' : 'Start the lesson'}
          </button>
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
        </main>
      )}
    </div>
  )
}
