import React from 'react';
import { cn } from '../lib/utils';

interface ChatMessageFormatterProps {
  content: string;
  isUser?: boolean;
  className?: string;
}

function renderInline(text: string): React.ReactNode {
  // Processa **negrito** e `código`
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);

  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={i} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code key={i} className="px-1.5 py-0.5 rounded bg-white/10 text-accent-amber font-mono text-[11px]">
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

export function ChatMessageFormatter({ content, isUser = false, className }: ChatMessageFormatterProps) {
  if (isUser) {
    return <div className={cn("whitespace-pre-wrap leading-relaxed", className)}>{content}</div>;
  }

  // Tratamento de avisos de erro formatados
  if (content.startsWith('⚠️')) {
    const withoutIcon = content.replace(/^⚠️\s*/, '');
    const paragraphs = withoutIcon.split(/\n\s*\n/);

    return (
      <div className={cn("bg-amber-500/10 border border-amber-500/30 rounded-xl p-3.5 text-xs text-amber-200 space-y-2 leading-relaxed", className)}>
        <div className="font-bold flex items-center gap-1.5 text-accent-amber text-xs">
          <span>⚠️</span> Aviso de Conexão com a IA
        </div>
        {paragraphs.map((p, idx) => (
          <p key={idx} className="whitespace-pre-wrap">{renderInline(p)}</p>
        ))}
      </div>
    );
  }

  // Divide o texto por quebras de linha duplas para gerar parágrafos distintos e espaçados
  const blocks = content.split(/\n\s*\n/);

  return (
    <div className={cn("space-y-3 leading-relaxed text-sm", className)}>
      {blocks.map((block, bIdx) => {
        const trimmed = block.trim();
        if (!trimmed) return null;

        const lines = trimmed.split('\n').map(l => l.trim()).filter(Boolean);

        // Verifica se o bloco é uma lista de itens (iniciando com -, *, • ou número.)
        const isList = lines.length > 0 && lines.every(line => /^([-•*]|\d+[\).])\s/.test(line));

        if (isList) {
          return (
            <ul key={bIdx} className="space-y-1.5 my-2 pl-1">
              {lines.map((line, lIdx) => {
                const cleanText = line.replace(/^([-•*]|\d+[\).])\s*/, '');
                return (
                  <li key={lIdx} className="flex items-start gap-2 text-gray-200 text-xs md:text-sm">
                    <span className="text-accent-amber font-bold shrink-0 mt-0.5">•</span>
                    <span className="flex-1 leading-snug">{renderInline(cleanText)}</span>
                  </li>
                );
              })}
            </ul>
          );
        }

        // Parágrafo padrão
        return (
          <p key={bIdx} className="text-gray-200 text-xs md:text-sm leading-relaxed">
            {lines.map((line, lIdx) => (
              <React.Fragment key={lIdx}>
                {lIdx > 0 && <br />}
                {renderInline(line)}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
