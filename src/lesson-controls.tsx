import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import type { CanvasInteractionEvent } from './components/cvi/components/magic-canvas/runtime'
import {
  getShownCanvasComponent,
  isCanvasToolCallMessage,
} from './components/cvi/components/magic-canvas/runtime'
import { useObservableEvent, useSendAppMessage } from './components/cvi/hooks/cvi-events-hooks'

type LessonControlsValue = {
  ready: boolean
  slidesDone: boolean
  introStarted: boolean
  nextBusy: boolean
  advancePicture: () => void
  onInteraction: (event: CanvasInteractionEvent) => void
}

const LessonControlsContext = createContext<LessonControlsValue | null>(null)

export function useLessonControls() {
  const value = useContext(LessonControlsContext)
  if (!value) throw new Error('Lesson controls are only available during a call.')
  return value
}

// The PAL only speaks again after a student turn. Picture advances wait until he
// stops, because a message sent while he is talking is dropped. Choices and
// Explain do not use this queue. They send immediately, the same way typing does.
export function LessonControlsProvider({ children }: { children: ReactNode }) {
  const sendAppMessage = useSendAppMessage()
  const started = useRef(false)
  // Only the pal turn counts. Tavus also sends a replica copy, and treating
  // that copy as a new turn left Next queued forever.
  const palSpeaking = useRef(false)
  const conversationId = useRef<string | null>(null)
  const pendingPrompt = useRef<string | null>(null)
  const lastNext = useRef(0)
  const retryTimer = useRef<number | null>(null)
  const [ready, setReady] = useState(false)
  const [introStarted, setIntroStarted] = useState(false)
  const [nextBusy, setNextBusy] = useState(false)
  const [slidesDone, setSlidesDone] = useState(false)

  const respond = useCallback(
    (id: string, text: string) =>
      sendAppMessage({
        message_type: 'conversation',
        event_type: 'conversation.respond',
        conversation_id: id,
        properties: { text },
      }),
    [sendAppMessage],
  )

  const flush = useCallback(() => {
    if (retryTimer.current !== null) {
      window.clearTimeout(retryTimer.current)
      retryTimer.current = null
    }
    const id = conversationId.current
    const text = pendingPrompt.current
    if (!id || !text) return
    pendingPrompt.current = null
    respond(id, text)
  }, [respond])

  useObservableEvent<unknown>(
    useCallback(
      (event) => {
        if (event.event_type === 'conversation.tool_call' && isCanvasToolCallMessage(event)) {
          const shown = getShownCanvasComponent(event)
          if (shown === 'canvas.image') return
          if (shown === 'canvas.question' || shown === 'canvas.input' || shown === 'canvas.text') {
            setSlidesDone(true)
          }
          return
        }

        if (event.event_type === 'conversation.started_speaking') {
          conversationId.current = event.conversation_id
          setReady(true)
          if (event.properties.role === 'pal') palSpeaking.current = true
          return
        }
        if (event.event_type !== 'conversation.stopped_speaking') return
        conversationId.current = event.conversation_id
        setReady(true)
        if (event.properties.role === 'user') return
        if (event.properties.role === 'replica') {
          if (!started.current) {
            started.current = true
            setIntroStarted(true)
            respond(event.conversation_id, 'Start.')
          } else if (!palSpeaking.current) {
            flush()
          }
          return
        }
        palSpeaking.current = false
        if (!started.current) {
          started.current = true
          setIntroStarted(true)
          respond(event.conversation_id, 'Start.')
        } else {
          flush()
        }
      },
      [flush, respond],
    ),
  )

  const finishPicture = useCallback(() => {
    const now = Date.now()
    if (now - lastNext.current < 900) return
    lastNext.current = now
    setNextBusy(true)
    window.setTimeout(() => setNextBusy(false), 900)
    const id = conversationId.current
    if (!id) return
    if (palSpeaking.current) {
      pendingPrompt.current = 'Next.'
      if (retryTimer.current !== null) window.clearTimeout(retryTimer.current)
      retryTimer.current = window.setTimeout(() => {
        retryTimer.current = null
        palSpeaking.current = false
        flush()
      }, 1500)
      return
    }
    respond(id, 'Next.')
  }, [flush, respond])

  const onInteraction = useCallback(
    (event: CanvasInteractionEvent) => {
      if (event.component !== 'canvas.image' || event.type !== 'dismiss') return
      conversationId.current = event.conversation_id
      finishPicture()
    },
    [finishPicture],
  )

  return (
    <LessonControlsContext.Provider
      value={{ ready, slidesDone, introStarted, nextBusy, advancePicture: finishPicture, onInteraction }}
    >
      {children}
    </LessonControlsContext.Provider>
  )
}
