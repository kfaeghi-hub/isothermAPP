// The platform rich-text editor (RICH-TEXT-PROPOSAL Phase 1, ruled 2026-08-20).
//
// CHROME = SCHEMA EXACTLY (ruled Q4, promoted to the pattern record): B, I,
// bullets, ordered — and H2/H3 only in the Cx Plan tier. No color pickers, no
// tables, no indent, nothing the door would strip: *a control that inserts
// what storage refuses is a lie in button form.*
//
// The extension list IS the whitelist — the exact packages, never bare
// StarterKit, so an upgrade cannot silently enable a node the platform schema
// forbids. Pinned at 3.30.2 (exact); upgrades are deliberate render-twin-
// diffed steps (ruled Q5).
//
// THE EXPAND SHELL LIVES HERE (Amendment 1, ruled 2026-08-20): the editor and
// the ⤢ expand-to-full-size shell are ONE PACKAGE — every surface that adopts
// rich text gets both, one draft state, two views. The ⤢ renders VISIBLY at
// rest (the W1 door law: a control must look like a control — the meetings
// original shipped opacity-0 hover-gated and the owner could not find it).
// One live editor at a time: the modal editor mounts from the current value
// and writes through the same onChange; closing remounts the inline view from
// that value, so nothing is lost in either direction.
import { useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import Bold from '@tiptap/extension-bold'
import Italic from '@tiptap/extension-italic'
import { BulletList, OrderedList, ListItem } from '@tiptap/extension-list'
import Heading from '@tiptap/extension-heading'
import { Modal } from './ui/Modal'
import type { RichDoc, RichTier } from '../lib/richText'

interface RichTextEditorProps {
  value: RichDoc
  tier?: RichTier
  onChange: (doc: RichDoc) => void
  /** false = compact inline view: no toolbar (Ctrl+B/I and the full editor
   *  carry the structure controls), tight padding for dense tables. */
  chrome?: boolean
  /** Presence enables the ⤢ expand shell. testId lands on the ⤢ button. */
  expand?: { title: string; testId?: string }
  /** Fired when an edit session ends: inline blur, and modal close. The
   *  meetings commit-on-blur path rides this; form-state surfaces omit it. */
  onCommit?: () => void
}

function EditorPane({ value, tier, onChange, chrome, compact, onBlurCommit }: {
  value: RichDoc
  tier: RichTier
  onChange: (doc: RichDoc) => void
  chrome: boolean
  compact: boolean
  onBlurCommit?: () => void
}) {
  // Event options may be captured at mount — route through refs so the
  // handlers always see the caller's LATEST closures (draft state included).
  const onChangeRef = useRef(onChange); onChangeRef.current = onChange
  const onBlurRef = useRef(onBlurCommit); onBlurRef.current = onBlurCommit
  const editor = useEditor({
    extensions: [
      Document, Paragraph, Text, Bold, Italic,
      BulletList, OrderedList, ListItem,
      ...(tier === 'cxplan' ? [Heading.configure({ levels: [2, 3] })] : []),
    ],
    content: value,
    onUpdate: ({ editor }) => onChangeRef.current(editor.getJSON() as RichDoc),
    onBlur: () => onBlurRef.current?.(),
  })
  if (!editor) return null

  const btn = (active: boolean) =>
    `px-1.5 py-0.5 text-[11px] rounded border ${active
      ? 'border-standard-600 bg-standard-600/10 text-standard-700 font-semibold'
      : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700'}`

  // A TOOLBAR BUTTON MUST NEVER TAKE FOCUS. Without this the click blurs the
  // editor, onBlur commits mid-edit, and the consumer's save re-seeds the
  // editor from the committed value — the toggle and the next keystrokes are
  // lost. Measured 2026-08-20 on an issued meeting: two paragraphs + a bullet
  // toggle came back as four paragraphs, the first typed word gone.
  const keepFocus = (e: React.MouseEvent) => e.preventDefault()

  return (
    <>
      {chrome && (
        <div className="flex items-center gap-1 px-2 py-1 border-b border-gray-100 bg-gray-50/60">
          <button type="button" onMouseDown={keepFocus} onClick={() => editor.chain().focus().toggleBold().run()}
            className={btn(editor.isActive('bold'))} title="Bold"><b>B</b></button>
          <button type="button" onMouseDown={keepFocus} onClick={() => editor.chain().focus().toggleItalic().run()}
            className={btn(editor.isActive('italic'))} title="Italic"><i>I</i></button>
          <span className="w-px h-4 bg-gray-200 mx-0.5" />
          <button type="button" onMouseDown={keepFocus} onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={btn(editor.isActive('bulletList'))} title="Bulleted list">•&nbsp;list</button>
          <button type="button" onMouseDown={keepFocus} onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={btn(editor.isActive('orderedList'))} title="Numbered list">1.&nbsp;list</button>
          {tier === 'cxplan' && (
            <>
              <span className="w-px h-4 bg-gray-200 mx-0.5" />
              <button type="button" onMouseDown={keepFocus} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                className={btn(editor.isActive('heading', { level: 2 }))} title="Sub-heading">H2</button>
              <button type="button" onMouseDown={keepFocus} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                className={btn(editor.isActive('heading', { level: 3 }))} title="Minor heading">H3</button>
            </>
          )}
        </div>
      )}
      <EditorContent
        editor={editor}
        className={`rich-editor text-gray-800
                   [&_.ProseMirror]:outline-none [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5
                   [&_h2]:text-base [&_h2]:font-bold [&_h3]:text-sm [&_h3]:font-bold
                   ${compact
                     ? 'px-1.5 py-1 text-xs leading-snug min-h-[1.6rem] [&_p]:my-0.5'
                     : 'px-3 py-2 text-sm leading-relaxed min-h-[8rem] [&_p]:my-1'}`}
      />
    </>
  )
}

export function RichTextEditor({ value, tier = 'platform', onChange, chrome = true, expand, onCommit }: RichTextEditorProps) {
  const [expanded, setExpanded] = useState(false)
  // Remounting the inline pane after the modal closes re-reads `value`, which
  // holds every modal keystroke (same onChange) — the one-draft-two-views
  // guarantee without two live editors fighting over one document.
  const [inlineKey, setInlineKey] = useState(0)

  const closeExpand = () => {
    onCommit?.()
    setExpanded(false)
    setInlineKey(k => k + 1)
  }

  return (
    <div className={`relative border rounded focus-within:border-standard-600 ${chrome ? 'border-gray-200' : 'border-transparent hover:border-gray-200'}`}>
      {expand && (
        // VISIBLE AT REST — never opacity-0, never hover-conjured (Amendment 1).
        <button type="button" title="Open full editor" data-testid={expand.testId}
          onClick={() => setExpanded(true)}
          className={`absolute z-10 text-gray-400 hover:text-standard-700 leading-none px-1 py-0.5
                      ${chrome ? 'top-0.5 right-1 text-[12px]' : 'top-0.5 right-0.5 text-[11px]'}`}>⤢</button>
      )}
      <EditorPane key={inlineKey} value={value} tier={tier} onChange={onChange}
        chrome={chrome} compact={!chrome} onBlurCommit={onCommit} />
      {expand && expanded && (
        <Modal title={expand.title} open onClose={closeExpand} maxWidth="lg"
          footer={
            <div className="flex items-center justify-between w-full">
              <p className="text-[11px] text-gray-400">One draft, two views — nothing is lost between them.</p>
              <button onClick={closeExpand}
                className="text-xs bg-standard-700 text-white rounded px-3 py-1.5 hover:bg-standard-800">
                Done
              </button>
            </div>
          }>
          <div data-testid="expanded-editor"
            className="border border-gray-200 rounded focus-within:border-standard-600 [&_.rich-editor]:min-h-[18rem]">
            <EditorPane value={value} tier={tier} onChange={onChange}
              chrome={true} compact={false} />
          </div>
        </Modal>
      )}
    </div>
  )
}
