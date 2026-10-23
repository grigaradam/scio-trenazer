"use client";

import clsx from "clsx";
import ReactMarkdown from "react-markdown";
import { preprocess, rehypePlugins, remarkPlugins } from "@/lib/markdown";

export type QuoteEvent = "enter" | "leave" | "click";

/**
 * quoteSource marks text an explanation may quote from; onQuote makes [[quotes]] interactive
 * (see lib/quotes.ts).
 */
export function RichText({
  children,
  className,
  inline,
  quoteSource,
  onQuote,
}: {
  children: string;
  className?: string;
  inline?: boolean;
  quoteSource?: boolean;
  onQuote?: (quote: string, event: QuoteEvent) => void;
}) {
  return (
    <div className={clsx("rich", inline && "[&>p]:inline", className)} data-quote-source={quoteSource || undefined}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={{
          a:({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer" className="underline">
              {children}
            </a>
          ),
          cite: ({ children }) =>
            onQuote ? (
              <cite
                role="button"
                tabIndex={0}
                title="Ukázat v textu"
                onClick={(e) => onQuote(e.currentTarget.textContent ?? "", "click")}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onQuote(e.currentTarget.textContent ?? "", "click"))}
                onMouseEnter={(e) => onQuote(e.currentTarget.textContent ?? "", "enter")}
                onMouseLeave={(e) => onQuote(e.currentTarget.textContent ?? "", "leave")}
              >
                {children}
              </cite>
            ) : (
              <cite>{children}</cite>
            ),
        }}
      >
        {preprocess(children ?? "")}
      </ReactMarkdown>
    </div>
  );
}
