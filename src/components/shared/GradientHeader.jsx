import { Globe } from "lucide-react";

export default function GradientHeader({ title, subtitle }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-orange-500 via-orange-400 to-amber-400 p-8 md:p-12 text-white">
      <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/4" />
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/3 -translate-x-1/4" />
      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2.5 bg-white/20 backdrop-blur-sm rounded-xl">
            <Globe className="w-6 h-6" />
          </div>
          <span className="text-sm font-semibold tracking-wider uppercase text-white/80">GladexHub</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-display font-bold">{title}</h1>
        {subtitle && <p className="mt-2 text-white/80 text-sm md:text-base max-w-xl">{subtitle}</p>}
      </div>
    </div>
  );
}