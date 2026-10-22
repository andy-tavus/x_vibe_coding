import { useCallback, useEffect, useState } from 'react'
import { CVIProvider } from './components/cvi/components/cvi-provider'
import { Conversation } from './components/cvi/components/conversation'
import { MagicCanvas } from './components/cvi/components/magic-canvas'
import {
  createTavusConversation,
  endTavusConversation,
} from './components/cvi/lib/tavus-client'
import { LessonControlsProvider, useLessonControls } from './lesson-controls'
import lessonTitle from './assets/lesson-title.jpg'
import startLesson from './assets/start-the-lesson.png'
import zoomIn from './assets/zoom-in.jpg'
import zoomOut from './assets/zoom-out.jpg'

const PAL_ID = 'p4633735d729'
const ZOOM_KEY = 'kinder-zoom'
const STEPS = [0.7, 0.8, 0.9, 1, 1.15, 1.3]

function LessonCanvas() {
  const { onInteraction } = useLessonControls()
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
        <h1>
          <img src={lessonTitle} alt="Vibe-Coding with Puppet Mr. Wertner" />
        </h1>
        <div id="zoom">
          <button type="button" aria-label="Zoom out" onClick={() => changeZoom(-1)}>
            <img src={zoomOut} alt="" />
          </button>
          <span>{zoomLabel}</span>
          <button type="button" aria-label="Zoom in" onClick={() => changeZoom(1)}>
            <img src={zoomIn} alt="" />
          </button>
        </div>
      </header>
      {url ? (
        <CVIProvider>
          <LessonControlsProvider>
            <div className="call">
              <Conversation conversationUrl={url} onLeave={leave} />
              <LessonCanvas />
            </div>
          </LessonControlsProvider>
        </CVIProvider>
      ) : (
        <main className="start">
          <button type="button" onClick={start} disabled={starting} aria-label={starting ? 'Starting.' : 'Start the lesson'}>
            <img src={startLesson} alt="" />
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
