// Firm applicability rules — "which stages do not apply to which equipment type".
//
// FIRM-LEVEL, keyed to the equipment-type vocabulary and to stage-group NAMES.
// Seneca teaches a rule once and every future project inherits it; that is the
// whole reason these are not per-project rows.
//
// The burden scales with TYPES, never units: one rule settles 113 fan coils.
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'

interface Rule {
  id: string
  equipment_type: string
  stage_group_name: string
  column_label: string | null
  applicable: boolean
  rationale: string | null
  active: boolean
}

export function ApplicabilityRules() {
  const [rules, setRules]   = useState<Rule[]>([])
  const [types, setTypes]   = useState<string[]>([])
  const [groups, setGroups] = useState<string[]>([])
  const [open, setOpen]     = useState(false)

  const [nType, setNType]   = useState('')
  const [nGroup, setNGroup] = useState('')
  const [nCol, setNCol]     = useState('')
  const [nApplic, setNApplic] = useState(false)
  const [nWhy, setNWhy]     = useState('')

  const fetchAll = useCallback(async () => {
    const [r, t, g] = await Promise.all([
      supabase.from('cx_applicability_rules').select('*')
        .order('equipment_type').order('stage_group_name').order('column_label', { nullsFirst: true }),
      supabase.from('equipment_types').select('key').eq('active', true).order('sort_order'),
      // Stage-group NAMES come from the firm default, not from any one project —
      // a rule written against a project-local group name would not travel.
      supabase.from('cx_default_stage_groups').select('name').order('sort_order'),
    ])
    setRules((r.data ?? []) as Rule[])
    setTypes((t.data ?? []).map((x: any) => x.key))
    setGroups((g.data ?? []).map((x: any) => x.name))
  }, [])

  useEffect(() => { if (open) void fetchAll() }, [open, fetchAll])

  async function add() {
    if (!nType || !nGroup) return
    const { error } = await supabase.from('cx_applicability_rules').insert({
      equipment_type: nType, stage_group_name: nGroup,
      column_label: nCol.trim() || null, applicable: nApplic,
      rationale: nWhy.trim() || null,
      ratified_at: new Date().toISOString(),
    })
    if (error) { alert(error.message); return }
    setNCol(''); setNWhy(''); setNApplic(false)
    await fetchAll()
  }

  async function patch(id: string, p: Partial<Rule>) {
    const { error } = await supabase.from('cx_applicability_rules').update(p).eq('id', id)
    if (error) { alert(error.message); return }
    await fetchAll()
  }

  async function remove(id: string) {
    const { error } = await supabase.from('cx_applicability_rules').delete().eq('id', id)
    if (error) { alert(error.message); return }
    await fetchAll()
  }

  const inputCls = 'border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-teal-500'

  return (
    <section>
      <button onClick={() => setOpen(o => !o)}
        className="text-sm font-semibold text-gray-800 hover:text-teal-700">
        Applicability Rules ({rules.length}) {open ? '▾' : '▸'}
      </button>

      {open && (
        <>
          <p className="text-xs text-gray-400 mt-1 mb-3">
            Which commissioning stages do <span className="font-medium">not</span> apply to which
            equipment type. Firm-level: a rule learned on one project applies to every project.
            Leave <span className="font-medium">Column</span> blank for the whole stage group; name a
            column to write an exception, which <span className="font-medium">beats</span> the group
            rule. A manual override on a cell always wins over both.
          </p>

          <table className="w-full text-xs border-collapse max-lg:block max-lg:overflow-x-auto">
            <thead>
              <tr className="border-b border-gray-200 text-left text-[10px] uppercase tracking-wider text-gray-400">
                <th className="py-1.5 pr-3 w-32">Type</th>
                <th className="py-1.5 pr-3">Stage group</th>
                <th className="py-1.5 pr-3">Column (blank = all)</th>
                <th className="py-1.5 pr-3 w-24">Applies?</th>
                <th className="py-1.5 pr-3">Why</th>
                <th className="py-1.5 pr-3 w-16">Active</th>
                <th className="py-1.5 w-16" />
              </tr>
            </thead>
            <tbody>
              {rules.map(r => (
                <tr key={r.id} className="border-b border-gray-100">
                  <td className="py-1.5 pr-3 font-mono text-gray-600">{r.equipment_type}</td>
                  <td className="py-1.5 pr-3 text-gray-800">{r.stage_group_name}</td>
                  <td className="py-1.5 pr-3 text-gray-600">
                    {r.column_label ?? <span className="text-gray-300 italic">all columns</span>}
                  </td>
                  <td className="py-1.5 pr-3">
                    <span className={`text-[10px] font-semibold rounded px-1.5 py-0.5 ${
                      r.applicable ? 'text-teal-800 bg-teal-50' : 'text-gray-600 bg-gray-100'}`}>
                      {r.applicable ? 'APPLIES' : 'NOT APPLICABLE'}
                    </span>
                  </td>
                  <td className="py-1.5 pr-3 text-gray-500">{r.rationale ?? '—'}</td>
                  <td className="py-1.5 pr-3 text-center">
                    <input type="checkbox" checked={r.active}
                      onChange={e => patch(r.id, { active: e.target.checked })} />
                  </td>
                  <td className="py-1.5">
                    <button onClick={() => remove(r.id)}
                      className="text-red-400 hover:text-red-600">Delete</button>
                  </td>
                </tr>
              ))}
              {rules.length === 0 && (
                <tr><td colSpan={7} className="py-3 text-xs text-gray-400 italic">
                  No rules yet. Every stage applies to every unit until one says otherwise.
                </td></tr>
              )}
            </tbody>
          </table>

          <div className="flex flex-wrap gap-2 mt-2 items-center">
            <select value={nType} onChange={e => setNType(e.target.value)} className={`${inputCls} w-36 font-mono`}>
              <option value="">type…</option>
              {types.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={nGroup} onChange={e => setNGroup(e.target.value)} className={`${inputCls} w-56`}>
              <option value="">stage group…</option>
              {groups.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <input value={nCol} onChange={e => setNCol(e.target.value)}
              placeholder="column (blank = all)" className={`${inputCls} w-48`} />
            <label className="flex items-center gap-1 text-xs text-gray-600">
              <input type="checkbox" checked={nApplic} onChange={e => setNApplic(e.target.checked)} />
              applies
            </label>
            <input value={nWhy} onChange={e => setNWhy(e.target.value)}
              placeholder="why" className={`${inputCls} w-56`} />
            <button onClick={add} className="text-xs bg-teal-700 text-white rounded px-3 py-1 hover:bg-teal-800">
              Add rule
            </button>
          </div>

          <p className="text-[11px] text-gray-400 mt-2">
            Rules take effect on a project when someone applies them from that project's Cx Index.
            Applying never touches a manual override.
          </p>
        </>
      )}
    </section>
  )
}
