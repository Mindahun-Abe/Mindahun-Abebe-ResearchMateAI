import React, { useState } from 'react';
import {
  APA7_SOURCE_FORMAT_EXAMPLES,
  CITATION_STYLE_DEFINITIONS,
  CitationStyleId,
  IN_TEXT_CITATION_GUIDE,
} from '../utils/citationFormatter';
import { BookOpen, ChevronDown, ChevronUp, Check, FileText, Quote } from 'lucide-react';

interface CitationGuidePanelProps {
  selectedStyle: CitationStyleId;
  onSelectStyle: (style: CitationStyleId) => void;
}

export const CitationGuidePanel: React.FC<CitationGuidePanelProps> = ({
  selectedStyle,
  onSelectStyle,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-2.5 flex items-center justify-between text-xs hover:bg-slate-900/70 transition cursor-pointer"
      >
        <span className="font-semibold text-indigo-300 flex items-center gap-2">
          <BookOpen className="w-3.5 h-3.5" />
          <span>Academic Citation Style &amp; In-Text Reference Guides (12 Styles · APA 7 Source Formats)</span>
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
          <span>{isExpanded ? 'Hide Guide' : 'Show Full Guide'}</span>
          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </span>
      </button>

      {isExpanded && (
        <div className="p-4 border-t border-slate-800 space-y-5 text-xs">
          {/* 1. Common academic citation styles */}
          <div className="space-y-2">
            <h4 className="font-bold text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-indigo-400" />
              <span>1. Common Academic Citation Styles (Click Any Row to Apply)</span>
            </h4>
            <div className="overflow-x-auto rounded-lg border border-slate-800">
              <table className="w-full text-left text-[11px] text-slate-300">
                <thead className="bg-slate-900 text-slate-400 uppercase text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="py-2 px-2.5 w-10">No.</th>
                    <th className="py-2 px-2.5">Citation Style</th>
                    <th className="py-2 px-2.5">In-Text Citation Example</th>
                    <th className="py-2 px-2.5">Common Application</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {CITATION_STYLE_DEFINITIONS.map((style) => {
                    const isSelected = selectedStyle === style.id;
                    return (
                      <tr
                        key={style.id}
                        onClick={() => onSelectStyle(style.id)}
                        className={`cursor-pointer transition ${
                          isSelected
                            ? 'bg-indigo-950/50 text-white'
                            : 'hover:bg-slate-900/70'
                        }`}
                      >
                        <td className="py-2 px-2.5 font-mono text-slate-400">{style.number}</td>
                        <td className="py-2 px-2.5 font-semibold text-white">
                          <span className="inline-flex items-center gap-1.5">
                            {isSelected && <Check className="w-3 h-3 text-emerald-400" />}
                            <span>{style.name}</span>
                          </span>
                        </td>
                        <td className="py-2 px-2.5 font-mono text-teal-300">{style.inTextExample}</td>
                        <td className="py-2 px-2.5 text-slate-300">{style.commonApplication}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 2. Main types of in-text citation */}
          <div className="space-y-2">
            <h4 className="font-bold text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
              <Quote className="w-3.5 h-3.5 text-teal-400" />
              <span>2. Main Types of In-Text Citation</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {IN_TEXT_CITATION_GUIDE.map((group) => (
                <div
                  key={group.code}
                  className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 space-y-1.5"
                >
                  <h5 className="font-bold text-teal-300 text-xs">
                    {group.code}. {group.title}
                  </h5>
                  {group.description && (
                    <p className="text-[11px] text-slate-300">{group.description}</p>
                  )}
                  <ul className="space-y-1 text-[11px] text-slate-300">
                    {group.items.map((item) => (
                      <li key={item.label}>
                        <strong className="text-slate-100">{item.label}:</strong>{' '}
                        <span className="text-slate-300">{item.example}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {/* 3. Examples of APA 7 reference-list formats */}
          <div className="space-y-2">
            <h4 className="font-bold text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
              <span>3. Examples of APA 7 Reference-List Formats</span>
            </h4>
            <div className="overflow-x-auto rounded-lg border border-slate-800">
              <table className="w-full text-left text-[11px] text-slate-300">
                <thead className="bg-slate-900 text-slate-400 uppercase text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="py-2 px-3 w-40">Source Type</th>
                    <th className="py-2 px-3">Reference Format Example</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {APA7_SOURCE_FORMAT_EXAMPLES.map((row) => (
                    <tr key={row.sourceType}>
                      <td className="py-2 px-3 font-semibold text-white align-top">
                        {row.sourceType}
                      </td>
                      <td className="py-2 px-3 text-slate-300 leading-relaxed">
                        {row.formatExample}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
