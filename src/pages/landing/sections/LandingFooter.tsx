import { Link } from 'react-router-dom'
import { LogoMark } from '../../../components/Logo'

export function LandingFooter() {
  return (
    <footer className="bg-slate-900 text-slate-400 px-5 sm:px-10 py-10">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center gap-6 sm:gap-10">
        <div className="flex items-center gap-3">
          <LogoMark variant="reverse" className="h-8 w-auto" />
          <p className="font-display text-[13px] font-bold text-white uppercase leading-tight">
            Isotherm<br />Engineering Ltd.
          </p>
        </div>
        <div className="text-[12px] leading-relaxed">
          95 Mural Street, Suite 600, Richmond Hill, ON L4B 3G2<br />
          905-822-2430 · info@isothermengineering.com
        </div>
        <div className="sm:ml-auto text-[12px] flex flex-col sm:items-end gap-1.5">
          <Link to="/login" className="text-slate-300 hover:text-white transition-colors">Staff sign in</Link>
          <p>© {new Date().getFullYear()} Isotherm Engineering Ltd.</p>
        </div>
      </div>
    </footer>
  )
}
