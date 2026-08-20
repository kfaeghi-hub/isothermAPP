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
import { useEditor, EditorContent } from '@tiptap/react'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import Bold from '@tiptap/extension-bold'
import Italic from '@tiptap/extension-italic'
import { BulletList, OrderedList, ListItem } from '@tiptap/extension-list'
import Heading from '@tiptap/extension-heading'
import type { RichDoc, RichTier } from '../lib/richText'

export function RichTextEditor({ value, tier = 'platform', onChange }: {
  value: RichDoc
  tier?: RichTier
  onChange: (doc: RichDoc) => void
}) {
  const editor = useEditor({
    extensions: [
      Document, Paragraph, Text, Bold, Italic,
      BulletList, OrderedList, ListItem,
      ...(tier === 'cxplan' ? [Heading.configure({ levels: [2, 3] })] : []),
    ],
    content: value,
    onUpdate: ({ editor }) => onChange(editor.getJSON() as RichDoc),
  })
  if (!editor) return null

  const btn = (active: boolean) =>
    `px-1.5 py-0.5 text-[11px] rounded border ${active
      ? 'border-standard-600 bg-standard-600/10 text-standard-700 font-semibold'
      : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700'}`

  return (
    <div className="border border-gray-200 rounded focus-within:border-standard-600">
      <div className="flex items-center gap-1 px-2 py-1 border-b border-gray-100 bg-gray-50/60">
        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()}
          className={btn(editor.isActive('bold'))} title="Bold"><b>B</b></button>
        <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()}
          className={btn(editor.isActive('italic'))} title="Italic"><i>I</i></button>
        <span className="w-px h-4 bg-gray-200 mx-0.5" />
        <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={btn(editor.isActive('bulletList'))} title="Bulleted list">•&nbsp;list</button>
        <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={btn(editor.isActive('orderedList'))} title="Numbered list">1.&nbsp;list</button>
        {tier === 'cxplan' && (
          <>
            <span className="w-px h-4 bg-gray-200 mx-0.5" />
            <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              className={btn(editor.isActive('heading', { level: 2 }))} title="Sub-heading">H2</button>
            <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
              className={btn(editor.isActive('heading', { level: 3 }))} title="Minor heading">H3</button>
          </>
        )}
      </div>
      <EditorContent
        editor={editor}
        className="rich-editor px-3 py-2 text-sm text-gray-800 leading-relaxed min-h-[8rem]
                   [&_.ProseMirror]:outline-none [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5
                   [&_h2]:text-base [&_h2]:font-bold [&_h3]:text-sm [&_h3]:font-bold [&_p]:my-1"
      />
    </div>
  )
}
