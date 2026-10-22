import { useCallback, useEffect, useState } from 'react'
import { CVIProvider } from './components/cvi/components/cvi-provider'
import { Conversation } from './components/cvi/components/conversation'
import { MagicCanvas } from './components/cvi/components/magic-canvas'
import {
  createTavusConversation,
  endTavusConversation,
  LessonUnavailable,
} from './components/cvi/lib/tavus-client'
import { LessonControlsProvider, useLessonControls } from './lesson-controls'
import { LESSON_CONVERSATION_NAME, LESSON_PAL_ID } from './lesson-name'
import lessonTitle from './assets/lesson-title.jpg'
import startLesson from './assets/start-the-lesson.png'
import zoomIn from './assets/zoom-in.jpg'
import zoomOut from './assets/zoom-out.jpg'
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
  const [available, setAvailable] = useState<boolean | null>(null)
  const [adminOpen, setAdminOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [adminReady, setAdminReady] = useState(false)
  const [adminMessage, setAdminMessage] = useState('')
  const [adminBusy, setAdminBusy] = useState(false)

  useEffect(() => {
    const saved = Number(localStorage.getItem(ZOOM_KEY))
    if (STEPS.indexOf(saved) !== -1) setZoom(saved)
  }, [])

  useEffect(() => {
    document.documentElement.style.setProperty('--z', String(zoom))
    localStorage.setItem(ZOOM_KEY, String(zoom))
  }, [zoom])

  useEffect(() => {
    if (url) return undefined
    let stopped = false
    async function loadAvailability() {
      try {
        const response = await fetch('/api/lesson', { cache: 'no-store' })
        const data = (await response.json()) as { enabled?: boolean }
        if (!stopped) setAvailable(response.ok && data.enabled === true)
      } catch {
        if (!stopped) setAvailable(false)
      }
    }
    void loadAvailability()
    const timer = window.setInterval(() => {
      void loadAvailability()
    }, 15000)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [url])

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
        pal_id: LESSON_PAL_ID,
        conversation_name: LESSON_CONVERSATION_NAME,
        properties: {
          enable_closed_captions: true,
          max_call_duration: 3600,
        },
      })
      setConversationId(data.conversation_id)
      setUrl(data.conversation_url)
    } catch (err) {
      if (err instanceof LessonUnavailable) {
        setAvailable(false)
      } else {
        setError('The lesson did not start. Try again.')
      }
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

  function closeAdmin() {
    setAdminOpen(false)
    setPassword('')
    setAdminReady(false)
    setAdminMessage('')
    setAdminBusy(false)
  }

  async function submitAdmin(enabled?: boolean) {
    setAdminBusy(true)
    setAdminMessage('')
    try {
      const response = await fetch('/api/lesson', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(enabled === undefined ? { password } : { password, enabled }),
      })
      const data = (await response.json()) as {
        enabled?: boolean
        ended?: number
        failed?: number
        truncated?: boolean
        error?: string
      }
      if (!response.ok || typeof data.enabled !== 'boolean') {
        setAdminMessage(data.error || 'The lesson switch did not save.')
        return
      }
      setAvailable(data.enabled)
      setAdminReady(true)
      if (enabled === undefined) {
        setAdminMessage(data.enabled ? 'The lesson is on.' : 'The lesson is off.')
        return
      }
      if (data.enabled) {
        setAdminMessage('The lesson is on.')
        return
      }
      const ended = data.ended ?? 0
      const sentences = [
        'The lesson is off.',
        ended === 1 ? 'Ended 1 lesson call.' : `Ended ${ended} lesson calls.`,
      ]
      if (data.failed) sentences.push(`${data.failed} could not be ended.`)
      if (data.truncated) sentences.push('Some active calls were not checked. Turn it off again.')
      setAdminMessage(sentences.join(' '))
    } catch {
      setAdminMessage('The lesson switch did not save.')
    } finally {
      setAdminBusy(false)
    }
  }

  const zoomLabel = `${Math.round(zoom * 100)}%`
  const lessonClosed = available !== true

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
          <button
            type="button"
            className={starting ? 'start-lesson starting' : 'start-lesson'}
            onClick={start}
            disabled={starting || lessonClosed}
            aria-label={starting ? 'Starting.' : lessonClosed ? 'Puppet Mr Wertner isn\'t available right now' : 'Start the lesson'}
          >
            <img src={startLesson} alt="" />
          </button>
          {available === false ? <p>Puppet Mr Wertner isn't available right now</p> : null}
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
          <button type="button" className="admin-open" onClick={() => setAdminOpen(true)}>
            admin
          </button>
          {adminOpen ? (
            <div className="admin-shade">
              <form
                className="admin-panel"
                role="dialog"
                aria-label="Lesson controls"
                onSubmit={(event) => {
                  event.preventDefault()
                  void submitAdmin(adminReady ? available !== true : undefined)
                }}
              >
                <h2>Lesson controls</h2>
                {adminReady ? (
                  <p>{available ? 'The lesson is on.' : 'The lesson is off.'}</p>
                ) : (
                  <label>
                    Password
                    <input
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                  </label>
                )}
                {adminMessage ? <p className="admin-note">{adminMessage}</p> : null}
                <div className="admin-actions">
                  <button type="submit" disabled={adminBusy || (!adminReady && password.length === 0)}>
                    {adminBusy ? 'Working.' : adminReady ? (available ? 'Turn the lesson off' : 'Turn the lesson on') : 'Continue'}
                  </button>
                  <button type="button" onClick={closeAdmin}>
                    Close
                  </button>
                </div>
              </form>
            </div>
          ) : null}
        </main>
      )}
    </div>
  )
}
