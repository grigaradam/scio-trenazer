import Link from "next/link";
import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { headingParts, legalToc, type LegalDoc } from "@/lib/legal";
import { LegalFooter } from "./LegalFooter";
import { Logo } from "./Logo";

const text = (node: ReactNode): string =>
  typeof node === "string" || typeof node === "number"
    ? String(node)
    : Array.isArray(node)
      ? node.map(text).join("")
      : node && typeof node === "object" && "props" in node
        ? text((node as { props: { children?: ReactNode } }).props.children)
        : "";

/** Renders a legal Markdown document with anchored headings, in the app's own typography. */
export function LegalMarkdown({ body }: { body: string }) {
  return (
    <div className="legal text-[15px] leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h2: ({ children }) => {
            const { id, text: t } = headingParts(text(children));
            return (
              <h2 id={id} className="mt-10 scroll-mt-20 font-display text-xl font-extrabold first:mt-0">
                {t}
              </h2>
            );
          },
          h3: ({ children }) => <h3 className="mt-6 font-display text-base font-bold">{children}</h3>,
          p: ({ children }) => <p className="mt-3">{children}</p>,
          ul: ({ children }) => <ul className="mt-2 list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="mt-2 list-decimal space-y-1 pl-5">{children}</ol>,
          strong: ({ children }) => <strong className="font-bold">{children}</strong>,
          hr: () => <hr className="my-8 border-border" />,
          a: ({ href = "", children }) =>
            href.startsWith("/") || href.startsWith("#") ? (
              <Link href={href} className="font-semibold text-brand-600 underline underline-offset-2 dark:text-brand-300">
                {children}
              </Link>
            ) : (
              <a href={href} target="_blank" rel="noreferrer" className="font-semibold text-brand-600 underline underline-offset-2 dark:text-brand-300">
                {children}
              </a>
            ),
          table: ({ children }) => (
            <div className="mt-3 overflow-x-auto rounded-2xl border-2 border-border">
              <table className="w-full min-w-[520px] border-collapse text-left text-sm">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="border-b-2 border-border bg-surface-2 px-3 py-2 font-bold">{children}</th>,
          td: ({ children }) => <td className="border-t border-border px-3 py-2 align-top">{children}</td>,
          code: ({ children }) => <code className="rounded bg-surface-2 px-1 py-0.5 text-[0.9em]">{children}</code>,
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}

/** Public page shell for legal documents: logo, title, table of contents, document, footer. */
export function LegalPage({ doc, before, after }: { doc: LegalDoc; before?: ReactNode; after?: ReactNode }) {
  const toc = legalToc(doc.body);
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-5">
        <Link href="/" aria-label="Nanečisto – úvod">
          <Logo small />
        </Link>
        <Link href="/app" className="text-sm font-bold text-muted hover:text-text">
          Do aplikace →
        </Link>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16">
        <h1 className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">{doc.title}</h1>
        {doc.meta && <p className="mt-2 text-sm text-muted">{doc.meta}</p>}
        {before}
        {toc.length > 2 && (
          <nav aria-label="Obsah" className="mt-6 rounded-3xl border-2 border-border bg-surface p-5">
            <div className="text-xs font-extrabold uppercase tracking-wider text-muted">Obsah</div>
            <ol className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
              {toc.map((h) => (
                <li key={h.id}>
                  <a href={`#${h.id}`} className="font-semibold hover:text-brand-600">
                    {h.text}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        )}
        <article className="mt-8">
          <LegalMarkdown body={doc.body} />
        </article>
        {after}
      </main>
      <LegalFooter />
    </div>
  );
}
