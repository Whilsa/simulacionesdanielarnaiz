import React from 'react';

export default function Footer() {
  return (
    <footer className="w-full py-4 px-4 sm:px-6 bg-slate-900/5 border-t border-slate-200/80 text-center text-xs font-sans mt-auto print:hidden">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-slate-600">
        <p className="font-medium">© {new Date().getFullYear()} Daniel Arnaiz Boluda. Todos los derechos reservados.</p>
        <a 
          href="https://www.linkedin.com/in/dr-daniel-arnaiz/" 
          target="_blank" 
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 hover:text-emerald-900 hover:underline transition-colors cursor-pointer"
        >
          <span>Daniel Arnaiz Boluda • LinkedIn</span>
          <svg className="w-3.5 h-3.5 fill-current shrink-0" viewBox="0 0 24 24">
            <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/>
          </svg>
        </a>
      </div>
    </footer>
  );
}
