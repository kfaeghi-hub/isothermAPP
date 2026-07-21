// Dump a .docx (converted from .doc via Word COM) as sequentially numbered
// blocks: paragraphs (P) and table rows (T, with | -separated cells). The same
// numbering is used by audit-template.mjs for Word-source row reconciliation.
// Checkbox glyphs (☐☒□■✓✗ + Wingdings/Symbol PUA) are shown as [CHK].
//
// Usage: node out/dump-doc.mjs <file.docx>
import { readFileSync } from 'node:fs'
import { inflateRawSync } from 'node:zlib'

export function docBlocks(file) {
  const buf = readFileSync(file)
  let xml = null, i = 0
  while ((i = buf.indexOf('PK\x03\x04', i, 'latin1')) !== -1) {
    const method = buf.readUInt16LE(i + 8), compSize = buf.readUInt32LE(i + 18)
    const nameLen = buf.readUInt16LE(i + 26), extraLen = buf.readUInt16LE(i + 28)
    const name = buf.subarray(i + 30, i + 30 + nameLen).toString('latin1')
    const start = i + 30 + nameLen + extraLen
    if (name === 'word/document.xml' && compSize > 0) {
      const data = buf.subarray(start, start + compSize)
      xml = (method === 8 ? inflateRawSync(data) : data).toString('utf8')
      break
    }
    i = start + (compSize || 1)
  }
  if (!xml) throw new Error('no word/document.xml')
  const un = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
  const CHK = /[☐☑☒■□✓✗]/g
  const textOf = frag => {
    let t = [...frag.matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>/g)].map(m => un(m[1])).join('')
    if ([...frag.matchAll(/<w:sym [^>]*w:font="Wingdings[^"]*"/g)].length) t += ' [CHK]'
    return t.replace(CHK, '[CHK]').replace(/\s+/g, ' ').trim()
  }
  // body children in order
  const body = xml.match(/<w:body>([\s\S]*)<\/w:body>/)[1]
  const blocks = []
  const re = /<w:tbl>[\s\S]*?<\/w:tbl>|<w:p [^>]*>[\s\S]*?<\/w:p>|<w:p\/>|<w:p>[\s\S]*?<\/w:p>/g
  let m
  while ((m = re.exec(body)) !== null) {
    const frag = m[0]
    if (frag.startsWith('<w:tbl>')) {
      for (const rowM of frag.matchAll(/<w:tr[ >][\s\S]*?<\/w:tr>/g)) {
        const cells = [...rowM[0].matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map(c => textOf(c[0]))
        blocks.push({ kind: 'T', cells })
      }
    } else {
      const t = textOf(frag)
      blocks.push({ kind: 'P', cells: t ? [t] : [] })
    }
  }
  return blocks.map((b, idx) => ({ r: idx + 1, ...b }))
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  for (const b of docBlocks(process.argv[2])) {
    if (b.cells.length === 0) continue
    console.log(`R${b.r} ${b.kind}: ${b.cells.map(c => JSON.stringify(c)).join(' | ')}`)
  }
}
