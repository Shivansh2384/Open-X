"use client";

import { useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import "katex/dist/katex.min.css";

/** Recursively extract plain text from React children (for copy buttons). */
function textFromChildren(node: ReactNode): string {
  if (node == null || node === false) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textFromChildren).join("");
  if (typeof node === "object" && "props" in node) {
    // @ts-expect-error - react element children shape
    return textFromChildren(node.props?.children);
  }
  return "";
}

function CodeBlock({
  code,
  lang,
  className,
  children,
}: {
  code: string;
  lang: string;
  className?: string;
  children: ReactNode;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      /* ignore */
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-border bg-[var(--code-bg)]">
      <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.03] px-3 py-1.5">
        <span className="font-mono text-[11px] uppercase tracking-wide text-zinc-400">
          {lang}
        </span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-100"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-400" /> Copied
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" /> Copy
            </>
          )}
        </button>
      </div>
      <pre className="md m-0">
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}

export function Markdown({ content, className }: { content: string; className?: string }) {
  return (
    <div className={cn("md", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          [rehypeHighlight, { detect: true, ignoreMissing: true }],
          rehypeKatex,
        ]}
        components={{
          // Unwrap <pre>; CodeBlock (rendered by `code`) owns the <pre>.
          pre({ children }) {
            return <>{children}</>;
          },
          code({ className, children }) {
            const match = /language-(\w+)/.exec(className || "");
            const raw = textFromChildren(children);
            const isBlock = Boolean(match) || raw.includes("\n");
            if (isBlock) {
              return (
                <CodeBlock code={raw} lang={match?.[1] || "code"} className={className}>
                  <code className={className}>{children}</code>
                </CodeBlock>
              );
            }
            return <code className={className}>{children}</code>;
          },
          a({ href, children }) {
            return (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
